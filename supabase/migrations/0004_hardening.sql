-- Fixes from Supabase's database advisors (2026-10-30).

-- Pin the search path of the updated_at trigger function.
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Trigger functions are never called directly; they still run as triggers.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_resume_limit() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- Spending a quota is for signed-in users only (it already refused anon).
revoke execute on function public.consume_quota(text) from public, anon;
grant execute on function public.consume_quota(text) to authenticated;

-- Indexes behind the composite foreign keys (cascades and joins).
create index if not exists ai_generations_resume_user_idx on public.ai_generations (resume_id, user_id);
create index if not exists exports_resume_user_idx on public.exports (resume_id, user_id);
create index if not exists imports_resume_idx on public.imports (resume_id);
create index if not exists resume_versions_resume_user_idx on public.resume_versions (resume_id, user_id);
create index if not exists resumes_folder_user_idx on public.resumes (folder_id, user_id);
create index if not exists target_jobs_resume_user_idx on public.target_jobs (resume_id, user_id);
