-- Backend pieces on top of 0001: exports through a function, refunds and plan
-- sync for the server, Stripe ids for refunds, rate limits, and the job log.
-- Everything here that isn't for the signed-in user is revoked from anon and
-- authenticated, so only the service role (webhooks, cron, the server) can call it.

-- ---------------------------------------------------------------------------
-- exports: users can't insert rows directly (0001), so the export route records
-- one through this function. Returns true the first time a revision is
-- exported in a format, false on a repeat (which is free).

create or replace function public.record_export(
  p_resume uuid, p_format text, p_revision integer, p_template text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.resumes where id = p_resume and user_id = v_user) then
    raise exception 'resume_not_found' using errcode = 'P0002';
  end if;
  insert into public.exports (user_id, resume_id, format, template_id, revision)
    values (v_user, p_resume, p_format, p_template, p_revision)
    on conflict (resume_id, format, revision) do nothing
    returning id into v_id;
  return v_id is not null;
end $$;
revoke execute on function public.record_export(uuid, text, integer, text) from public, anon;
grant execute on function public.record_export(uuid, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- refunds: the period depends on the user's plan (lifetime for Free, the UTC
-- month for paid plans), so the server doesn't have to work it out.

create or replace function public.refund_quota_now(p_user uuid, p_kind text) returns void
language sql security definer set search_path = '' as $$
  update public.usage_counters u
     set used = greatest(u.used - 1, 0), updated_at = now()
    from public.profiles p
    join public.plan_limits l on l.plan = p.plan and l.kind = p_kind
   where p.id = p_user
     and u.user_id = p_user and u.kind = p_kind
     and u.period = case l.period_type
       when 'month' then to_char(now() at time zone 'utc', 'YYYY-MM')
       else 'lifetime' end;
$$;
revoke execute on function public.refund_quota_now(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- billing: Stripe ids needed for refunds and the reconcile job

alter table public.subscriptions
  add column stripe_price_id text,
  add column stripe_payment_intent_id text unique;   -- lifetime (one-off) payments

-- The plan is derived from the subscriptions, never set directly by the app:
-- an active lifetime purchase wins, then any live monthly or quarterly
-- subscription (past_due keeps Pro while Stripe retries the card), else Free.
create or replace function public.sync_plan(p_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_plan text;
begin
  select case
    when bool_or(kind = 'lifetime' and status = 'active') then 'lifetime'
    when bool_or(kind in ('month', 'quarter') and status in ('active', 'trialing', 'past_due')) then 'pro'
    else 'free' end
    into v_plan
    from public.subscriptions where user_id = p_user;
  update public.profiles set plan = coalesce(v_plan, 'free') where id = p_user;
  return coalesce(v_plan, 'free');
end $$;
revoke execute on function public.sync_plan(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- rate limits: fixed windows counted in Postgres, so they hold across every
-- server instance. Keys are hashed by the app (no emails or IPs stored).

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;   -- no policies: service role only

-- Counts one hit and returns true if it's within the limit.
create or replace function public.hit_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_start, 1)
    on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
    returning hits into v_hits;
  return v_hits <= p_max;
end $$;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- jobs: one row per scheduled run. A run that still fails after its retries
-- is stored as 'dead' with the error, which is the dead-letter log.

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  status text not null check (status in ('ok', 'dead')),
  attempts integer not null check (attempts >= 1),
  result jsonb,
  error text,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);
create index job_runs_job_started_idx on public.job_runs (job, started_at desc);
alter table public.job_runs enable row level security;      -- no policies: service role only

-- Keep the last 50 versions of each resume, plus everything from the last 7 days.
create or replace function public.prune_versions() returns integer
language sql security definer set search_path = '' as $$
  with ranked as (
    select id, created_at,
           row_number() over (partition by resume_id order by created_at desc) as n
      from public.resume_versions
  ), gone as (
    delete from public.resume_versions v using ranked r
     where v.id = r.id and r.n > 50 and r.created_at < now() - interval '7 days'
    returning 1
  )
  select count(*)::integer from gone;
$$;

-- AI logs hold no resume text, but there's no reason to keep them forever.
create or replace function public.prune_ai_logs() returns integer
language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.ai_generations where created_at < now() - interval '180 days' returning 1
  )
  select count(*)::integer from gone;
$$;

-- Old rate-limit windows, processed Stripe events and job runs.
create or replace function public.prune_housekeeping() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limits integer;
  v_events integer;
  v_runs integer;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_limits = row_count;
  delete from public.stripe_events
   where processed_at is not null and received_at < now() - interval '90 days';
  get diagnostics v_events = row_count;
  delete from public.job_runs where started_at < now() - interval '90 days';
  get diagnostics v_runs = row_count;
  return jsonb_build_object('rate_limits', v_limits, 'stripe_events', v_events, 'job_runs', v_runs);
end $$;

revoke execute on function public.prune_versions() from public, anon, authenticated;
revoke execute on function public.prune_ai_logs() from public, anon, authenticated;
revoke execute on function public.prune_housekeeping() from public, anon, authenticated;
