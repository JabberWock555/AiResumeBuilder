-- BUG-009: record_export was callable by signed-in users. With their own
-- session token (readable in the browser's developer tools) a user could mark
-- a revision as exported without downloading it, and the PDF route then served
-- that revision free: unlimited downloads on the Free plan.
-- Now only the server (service role) records an export, for a named user, and
-- only for the resume's current revision.

drop function if exists public.record_export(uuid, text, integer, text);

create or replace function public.record_export(
  p_user uuid, p_resume uuid, p_format text, p_revision integer, p_template text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_revision integer;
  v_id uuid;
begin
  select revision into v_revision from public.resumes where id = p_resume and user_id = p_user;
  if v_revision is null then
    raise exception 'resume_not_found' using errcode = 'P0002';
  end if;
  if v_revision <> p_revision then
    raise exception 'revision_mismatch' using errcode = '40001';
  end if;
  insert into public.exports (user_id, resume_id, format, template_id, revision)
    values (p_user, p_resume, p_format, p_template, p_revision)
    on conflict (resume_id, format, revision) do nothing
    returning id into v_id;
  return v_id is not null;
end $$;
revoke execute on function public.record_export(uuid, uuid, text, integer, text) from public, anon, authenticated;
