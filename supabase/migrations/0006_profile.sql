-- The saved profile: one resume-shaped document per user (contact, summary,
-- experience, education, skills, ...). New resumes start as a copy of it, so
-- details are entered once. Edited by its owner with the same optimistic
-- concurrency as resumes (master_revision).

alter table public.profiles
  add column master_content jsonb,
  add column master_revision integer not null default 0,
  add column master_updated_at timestamptz,
  add column experience_level text check (experience_level in
    ('internship', 'entry', 'associate', 'junior', 'mid_senior', 'director', 'executive')),
  add constraint master_content_size check (master_content is null or pg_column_size(master_content) < 512000);

grant update (master_content, master_revision, master_updated_at, experience_level) on public.profiles to authenticated;
