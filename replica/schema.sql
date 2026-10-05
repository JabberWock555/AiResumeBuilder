-- Schema for the resume builder (a rebuild of Rezi's core features).
-- Target: Supabase Postgres 15+. Run as the first migration
-- (supabase/migrations/0001_init.sql).
--
-- Access rules: Postgres row level security on every table. The browser and
-- the server both use the signed-in user's Supabase client, so RLS applies
-- everywhere. Only Stripe webhooks, cron jobs and account deletion use the
-- service role.
--
-- Resume content lives in one jsonb document per resume (validated by a zod
-- schema in the app, see architecture.md). It keeps autosave, version history,
-- preview, PDF rendering and import to one shape.

-- ---------------------------------------------------------------------------
-- helpers

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created by trigger

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  app_language text not null default 'en-US',
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  -- written only by the Stripe webhook (service role)
  plan text not null default 'free' check (plan in ('free', 'pro', 'lifetime')),
  stripe_customer_id text unique,
  -- {intent, job_stage, completed_at}; answers to the onboarding questions
  onboarding jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- billing

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('month', 'quarter', 'lifetime')),
  status text not null check (status in
    ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid', 'refunded')),
  stripe_subscription_id text unique,          -- null for lifetime (one-off payment)
  stripe_checkout_session_id text unique,
  amount_cents integer not null check (amount_cents >= 0),
  currency char(3) not null,                   -- ISO 4217, lower case as Stripe sends it
  current_period_end timestamptz,              -- null for lifetime
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_id_idx on public.subscriptions (user_id);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Stripe retries webhooks; the event id makes every handler run once.
create table public.stripe_events (
  id text primary key,                         -- evt_...
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- plan limits and usage. Limits live in the database so they are enforced in
-- one place, by consume_quota(), not by the UI.

create table public.plan_limits (
  plan text not null check (plan in ('free', 'pro', 'lifetime')),
  kind text not null check (kind in
    ('resume', 'ai_generation', 'pdf_download', 'docx_download', 'import')),
  max_uses integer check (max_uses >= 0),      -- null = unlimited
  period_type text not null check (period_type in ('count', 'lifetime', 'month')),
  primary key (plan, kind)
);

insert into public.plan_limits (plan, kind, max_uses, period_type) values
  ('free',     'resume',        1,    'count'),
  ('free',     'ai_generation', 10,   'lifetime'),
  ('free',     'pdf_download',  3,    'lifetime'),
  ('free',     'docx_download', 0,    'lifetime'),
  ('free',     'import',        3,    'lifetime'),
  ('pro',      'resume',        null, 'count'),
  ('pro',      'ai_generation', 300,  'month'),   -- fair-use cap, revisit at launch
  ('pro',      'pdf_download',  null, 'month'),
  ('pro',      'docx_download', null, 'month'),
  ('pro',      'import',        30,   'month'),
  ('lifetime', 'resume',        null, 'count'),
  ('lifetime', 'ai_generation', 300,  'month'),
  ('lifetime', 'pdf_download',  null, 'month'),
  ('lifetime', 'docx_download', null, 'month'),
  ('lifetime', 'import',        30,   'month');

create table public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null,                        -- 'lifetime' or 'YYYY-MM' (UTC)
  kind text not null check (kind in
    ('ai_generation', 'pdf_download', 'docx_download', 'import')),
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period, kind)
);

-- Atomically spend one unit of a quota for the signed-in user. Returns the
-- units left (null = unlimited). Raises 'quota_exceeded' when none are left.
-- One conditional UPDATE, so two parallel requests cannot both take the last unit.
create or replace function public.consume_quota(p_kind text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_plan text;
  v_max integer;
  v_period_type text;
  v_period text;
  v_used integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select plan into v_plan from public.profiles where id = v_user;
  select max_uses, period_type into v_max, v_period_type
    from public.plan_limits where plan = v_plan and kind = p_kind;
  if v_period_type is null or v_period_type = 'count' then
    raise exception 'unknown_quota_kind: %', p_kind;
  end if;

  v_period := case v_period_type
    when 'month' then to_char(now() at time zone 'utc', 'YYYY-MM')
    else 'lifetime' end;

  insert into public.usage_counters (user_id, period, kind)
    values (v_user, v_period, p_kind)
    on conflict do nothing;

  update public.usage_counters
     set used = used + 1, updated_at = now()
   where user_id = v_user and period = v_period and kind = p_kind
     and (v_max is null or used < v_max)
  returning used into v_used;

  if v_used is null then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = p_kind;
  end if;

  return case when v_max is null then null else v_max - v_used end;
end $$;

-- Give a unit back when the AI call or export fails after consume_quota().
-- Service role only: a user must not be able to refund themselves.
create or replace function public.refund_quota(p_user uuid, p_kind text, p_period text)
returns void
language sql security definer set search_path = '' as $$
  update public.usage_counters
     set used = greatest(used - 1, 0), updated_at = now()
   where user_id = p_user and kind = p_kind and period = p_period;
$$;
revoke execute on function public.refund_quota(uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- folders (the dashboard's "Add Section" groups)

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  position integer not null default 0,
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index folders_user_position_idx on public.folders (user_id, position);
create trigger folders_updated_at before update on public.folders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- resumes

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  folder_id uuid,
  name text not null check (char_length(name) between 1 and 120),
  experience_level text not null check (experience_level in
    ('internship', 'entry', 'associate', 'junior', 'mid_senior', 'director', 'executive')),
  language text not null default 'en-US',
  template_id text not null default 'standard',   -- templates are code, not rows
  settings jsonb not null default '{}',           -- font, size, spacing, colours, ...
  content jsonb not null default '{"contact": {}, "summary": {"text": ""}, "sections": []}',
  revision integer not null default 1,            -- optimistic concurrency for autosave
  source text not null default 'scratch' check (source in
    ('scratch', 'import', 'duplicate', 'linkedin_pdf', 'agent')),
  last_score smallint check (last_score between 0 and 100),   -- cached for the dashboard card
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- a resume can only sit in its owner's folder; deleting the folder keeps the resume
  foreign key (folder_id, user_id) references public.folders (id, user_id)
    on delete set null (folder_id),
  constraint content_size check (pg_column_size(content) < 512000)
);
create index resumes_user_created_idx on public.resumes (user_id, created_at desc);
create index resumes_user_updated_idx on public.resumes (user_id, updated_at desc);
create index resumes_folder_idx on public.resumes (folder_id);
create trigger resumes_updated_at before update on public.resumes
  for each row execute function public.set_updated_at();

-- Resume count limit (Free: 1). The advisory lock stops two parallel creates
-- from both passing the count.
create or replace function public.enforce_resume_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_max integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  select l.max_uses into v_max
    from public.plan_limits l join public.profiles p on p.plan = l.plan
   where p.id = new.user_id and l.kind = 'resume';
  if v_max is not null
     and (select count(*) from public.resumes where user_id = new.user_id) >= v_max then
    raise exception 'quota_exceeded' using errcode = 'P0001', detail = 'resume';
  end if;
  return new;
end $$;
create trigger resumes_limit before insert on public.resumes
  for each row execute function public.enforce_resume_limit();

-- Snapshots for Version History. Immutable, so no updated_at.
create table public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  revision integer not null,
  content jsonb not null,
  settings jsonb not null,
  template_id text not null,
  reason text not null check (reason in
    ('autosave', 'before_ai', 'before_import', 'before_restore', 'manual')),
  created_at timestamptz not null default now(),
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete cascade
);
create index resume_versions_resume_created_idx on public.resume_versions (resume_id, created_at desc);
create index resume_versions_user_idx on public.resume_versions (user_id);

-- The job a resume is tailored to. One per resume.
create table public.target_jobs (
  id uuid primary key default gen_random_uuid(),
  resume_id uuid not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  company text check (char_length(company) <= 120),
  description text not null check (char_length(description) between 50 and 20000),
  -- [{term, aliases[], weight 1-3, kind: skill|tool|cert|domain|soft}]
  keywords jsonb not null default '[]',
  dismissed text[] not null default '{}',         -- keywords the user answered "No" to
  extracted_at timestamptz,
  extraction_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete cascade
);
create index target_jobs_user_idx on public.target_jobs (user_id);
create trigger target_jobs_updated_at before update on public.target_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- logs: AI calls, exports, imports

-- What each AI call cost and whether it counted against the quota.
-- Prompts and outputs are not stored.
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_id uuid,
  kind text not null check (kind in
    ('bullet_suggest', 'bullet_complete', 'bullet_quantify', 'bullet_rewrite',
     'summary', 'keyword_bullet', 'keyword_extract', 'import_parse', 'skills')),
  model text not null,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cost_microusd bigint check (cost_microusd >= 0),   -- millionths of a US dollar
  counted boolean not null,                          -- spent a user quota unit
  status text not null check (status in ('ok', 'error', 'refunded')),
  created_at timestamptz not null default now(),
  foreign key (resume_id, user_id) references public.resumes (id, user_id)
    on delete set null (resume_id)
);
create index ai_generations_user_created_idx on public.ai_generations (user_id, created_at desc);
create index ai_generations_resume_idx on public.ai_generations (resume_id);

-- One row per export. Re-exporting the same revision in the same format is free.
create table public.exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume_id uuid not null,
  format text not null check (format in ('pdf', 'docx', 'gdrive')),
  template_id text not null,
  revision integer not null,
  created_at timestamptz not null default now(),
  foreign key (resume_id, user_id) references public.resumes (id, user_id) on delete cascade,
  unique (resume_id, format, revision)
);
create index exports_user_created_idx on public.exports (user_id, created_at desc);

-- Uploaded files waiting to be parsed into a resume. Files are deleted from
-- storage by the cleanup job once parsed or after 24 hours.
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,           -- imports/<user_id>/<id>.<ext>
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null check (mime_type in
    ('application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),   -- 5 MB
  status text not null default 'uploaded' check (status in
    ('uploaded', 'parsing', 'parsed', 'failed')),
  error text,
  resume_id uuid references public.resumes (id) on delete set null,
  file_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index imports_user_created_idx on public.imports (user_id, created_at desc);
create index imports_cleanup_idx on public.imports (created_at) where file_deleted_at is null;
create trigger imports_updated_at before update on public.imports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- row level security

alter table public.profiles        enable row level security;
alter table public.subscriptions   enable row level security;
alter table public.stripe_events   enable row level security;   -- no policies: service role only
alter table public.plan_limits     enable row level security;
alter table public.usage_counters  enable row level security;
alter table public.folders         enable row level security;
alter table public.resumes         enable row level security;
alter table public.resume_versions enable row level security;
alter table public.target_jobs     enable row level security;
alter table public.ai_generations  enable row level security;
alter table public.exports         enable row level security;
alter table public.imports         enable row level security;

-- profiles: read and edit your own row, but only the user-editable columns
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (full_name, app_language, theme, onboarding) on public.profiles to authenticated;

-- read-only for the owner; written by webhooks, consume_quota() or the server
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy usage_select on public.usage_counters for select to authenticated
  using (user_id = (select auth.uid()));
create policy ai_generations_select on public.ai_generations for select to authenticated
  using (user_id = (select auth.uid()));
create policy exports_select on public.exports for select to authenticated
  using (user_id = (select auth.uid()));
create policy plan_limits_select on public.plan_limits for select to anon, authenticated
  using (true);

-- full access to your own rows
create policy folders_all on public.folders for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy resumes_all on public.resumes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy resume_versions_select on public.resume_versions for select to authenticated
  using (user_id = (select auth.uid()));
create policy resume_versions_insert on public.resume_versions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy target_jobs_all on public.target_jobs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy imports_select on public.imports for select to authenticated
  using (user_id = (select auth.uid()));
create policy imports_insert on public.imports for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- storage: private buckets, one folder per user

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('imports', 'imports', false, 5242880,
   array['application/pdf',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('photos', 'photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create policy storage_own_folder_select on storage.objects for select to authenticated
  using (bucket_id in ('imports', 'photos')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_own_folder_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('imports', 'photos')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_own_folder_delete on storage.objects for delete to authenticated
  using (bucket_id in ('imports', 'photos')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Phase 2 tables (not created yet): cover_letters, job_applications,
-- agent_chats, agent_messages, interviews. Each gets user_id, RLS and the
-- same composite foreign key to resumes as target_jobs.
