// Applies every migration in supabase/migrations to an in-memory Postgres
// (PGlite) with stand-ins for Supabase auth and storage, then checks the
// access rules, quotas, billing and job functions.
// Run: npm run test:schema

import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'

const dir = new URL('./migrations/', import.meta.url)
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const db = new PGlite()

// Stand-ins for what Supabase provides.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage; grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`)

for (const f of migrations) await db.exec(readFileSync(new URL(f, dir), 'utf8'))
console.log(`applied ${migrations.join(', ')}`)

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
await db.exec(`insert into auth.users (id, raw_user_meta_data) values
  ('${A}', '{"full_name":"Test A"}'), ('${B}', '{}')`)

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`) }
const as = async (uid, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`)
  try { return { rows: (await db.query(sql)).rows } } catch (e) { return { error: e.message } }
  finally { await db.exec('reset role') }
}

let r = await db.query(`select full_name, plan from public.profiles where id = '${A}'`)
check('profile created by trigger', r.rows[0]?.full_name === 'Test A' && r.rows[0]?.plan === 'free')

r = await as(A, `insert into public.resumes (user_id, name, experience_level) values ('${A}', 'R1', 'junior') returning id`)
check('free user creates first resume', !r.error, r.error)
const resumeA = r.rows?.[0]?.id

r = await as(A, `insert into public.resumes (user_id, name, experience_level) values ('${A}', 'R2', 'junior')`)
check('free user blocked on second resume', /quota_exceeded/.test(r.error ?? ''), r.error)

r = await as(B, `select id from public.resumes`)
check('user B cannot see A resumes', r.rows?.length === 0, r.error)

r = await as(B, `update public.resumes set name = 'hacked' where id = '${resumeA}' returning id`)
check('user B cannot update A resume', r.rows?.length === 0, r.error)

r = await as(B, `insert into public.resumes (user_id, name, experience_level) values ('${A}', 'X', 'junior')`)
check('user B cannot insert a resume as A', !!r.error, r.error)

r = await as(B, `insert into public.target_jobs (resume_id, user_id, title, description)
  values ('${resumeA}', '${B}', 'Job', '${'x'.repeat(60)}')`)
check('user B cannot attach a target job to A resume', !!r.error, r.error)

r = await as(A, `insert into public.target_jobs (resume_id, user_id, title, description)
  values ('${resumeA}', '${A}', 'Product Designer', '${'x'.repeat(60)}') returning id`)
check('owner adds a target job', !r.error, r.error)

let ok = true
for (let i = 1; i <= 10; i++) {
  r = await as(A, `select public.consume_quota('ai_generation') as left`)
  if (r.error || r.rows[0].left !== 10 - i) { ok = false; console.log(r) }
}
check('10 AI generations count down to 0', ok)
r = await as(A, `select public.consume_quota('ai_generation')`)
check('11th AI generation refused', /quota_exceeded/.test(r.error ?? ''), r.error)

r = await as(A, `select public.consume_quota('docx_download')`)
check('free DOCX refused', /quota_exceeded/.test(r.error ?? ''), r.error)

r = await as(A, `select public.refund_quota('${A}', 'ai_generation', 'lifetime')`)
check('user cannot refund own quota', /permission denied/.test(r.error ?? ''), r.error)

await db.exec(`select public.refund_quota('${A}', 'ai_generation', 'lifetime')`)
r = await as(A, `select used from public.usage_counters where kind = 'ai_generation'`)
check('server refund gives one back', r.rows?.[0]?.used === 9, JSON.stringify(r))

r = await as(A, `update public.profiles set plan = 'pro' where id = '${A}'`)
check('user cannot change own plan', /permission denied/.test(r.error ?? ''), r.error)

r = await as(A, `update public.profiles set theme = 'dark' where id = '${A}' returning theme`)
check('user can change theme', r.rows?.[0]?.theme === 'dark', r.error)

await db.exec(`update public.profiles set plan = 'pro' where id = '${A}'`)
r = await as(A, `insert into public.resumes (user_id, name, experience_level) values ('${A}', 'R2', 'junior') returning id`)
check('pro user creates more resumes', !r.error, r.error)
r = await as(A, `select public.consume_quota('ai_generation') as left`)
const r2 = await as(B, `insert into public.resumes (user_id, name, experience_level) values ('${A}', 'X', 'junior')`)
check('user B cannot insert a resume as A (RLS, A is Pro)', /row-level security/.test(r2.error ?? ''), r2.error)
check('pro gets a monthly AI allowance', r.rows?.[0]?.left === 299, JSON.stringify(r))

r = await as(A, `insert into public.folders (user_id, name) values ('${A}', 'Keep') returning id`)
const folder = r.rows[0].id
await as(A, `update public.resumes set folder_id = '${folder}' where id = '${resumeA}'`)
r = await as(B, `insert into public.folders (user_id, name) values ('${B}', 'B folder') returning id`)
const folderB = r.rows[0].id
r = await as(A, `update public.resumes set folder_id = '${folderB}' where id = '${resumeA}'`)
check('resume cannot move into another user folder', !!r.error, r.error)
await as(A, `delete from public.folders where id = '${folder}'`)
r = await as(A, `select folder_id, user_id from public.resumes where id = '${resumeA}'`)
check('deleting a folder keeps the resume and its owner', r.rows?.[0]?.folder_id === null && r.rows?.[0]?.user_id === A, JSON.stringify(r))

r = await as(A, `insert into public.exports (user_id, resume_id, format, template_id, revision)
  values ('${A}', '${resumeA}', 'pdf', 'standard', 1)`)
check('client cannot write exports directly', !!r.error, r.error)

// --- 0002: exports, refunds, plan sync, rate limits, jobs

r = await as(A, `select public.record_export('${resumeA}', 'pdf', 1, 'standard') as fresh`)
check('first export of a revision is fresh', r.rows?.[0]?.fresh === true, r.error)
r = await as(A, `select public.record_export('${resumeA}', 'pdf', 1, 'standard') as fresh`)
check('repeat export of the same revision is not', r.rows?.[0]?.fresh === false, r.error)
r = await as(B, `select public.record_export('${resumeA}', 'pdf', 2, 'standard')`)
check('user B cannot record an export on A resume', /resume_not_found/.test(r.error ?? ''), r.error)
r = await as(B, `select id from public.exports`)
check('user B sees none of A exports', r.rows?.length === 0, r.error)

r = await as(A, `select public.refund_quota_now('${A}', 'ai_generation')`)
check('user cannot call refund_quota_now', /permission denied/.test(r.error ?? ''), r.error)
const month = new Date().toISOString().slice(0, 7)
await db.exec(`select public.refund_quota_now('${A}', 'ai_generation')`)
r = await db.query(`select used from public.usage_counters where user_id = '${A}' and kind = 'ai_generation' and period = '${month}'`)
check('refund_quota_now refunds the paid plan monthly period', r.rows?.[0]?.used === 0, JSON.stringify(r.rows))

r = await as(B, `select public.sync_plan('${B}')`)
check('user cannot call sync_plan', /permission denied/.test(r.error ?? ''), r.error)
r = await as(B, `insert into public.subscriptions (user_id, kind, status, amount_cents, currency) values ('${B}', 'month', 'active', 100, 'usd')`)
check('user cannot write subscriptions', !!r.error, r.error)
const plan = async () => (await db.query(`select public.sync_plan('${B}') as p`)).rows[0].p
await db.exec(`insert into public.subscriptions (user_id, kind, status, stripe_subscription_id, amount_cents, currency)
  values ('${B}', 'month', 'active', 'sub_1', 1200, 'usd')`)
check('active monthly subscription makes Pro', (await plan()) === 'pro')
await db.exec(`update public.subscriptions set status = 'past_due' where stripe_subscription_id = 'sub_1'`)
check('past_due keeps Pro while Stripe retries', (await plan()) === 'pro')
await db.exec(`update public.subscriptions set status = 'canceled' where stripe_subscription_id = 'sub_1'`)
check('canceled subscription goes back to Free', (await plan()) === 'free')
await db.exec(`insert into public.subscriptions (user_id, kind, status, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, currency)
  values ('${B}', 'lifetime', 'active', 'cs_1', 'pi_1', 9900, 'usd')`)
check('lifetime purchase makes Lifetime', (await plan()) === 'lifetime')
r = await as(A, `select id from public.subscriptions where user_id = '${B}'`)
check('user A cannot see B subscriptions', r.rows?.length === 0, r.error)
r = await as(B, `select plan from public.profiles where id = '${B}'`)
check('B reads own plan', r.rows?.[0]?.plan === 'lifetime', r.error)
await db.exec(`update public.subscriptions set status = 'refunded' where stripe_payment_intent_id = 'pi_1'`)
check('refunded lifetime goes back to Free', (await plan()) === 'free')

r = await as(A, `select public.hit_rate_limit('x', 2, 60)`)
check('user cannot call hit_rate_limit', /permission denied/.test(r.error ?? ''), r.error)
const hits = []
for (let i = 0; i < 3; i++) hits.push((await db.query(`select public.hit_rate_limit('login:abc', 2, 60) as ok`)).rows[0].ok)
check('rate limit allows 2 then refuses the 3rd', hits.join() === 'true,true,false', hits.join())
r = await as(A, `select * from public.rate_limits`)
check('users see no rate limit rows', r.rows?.length === 0, r.error)

await db.exec(`insert into public.ai_generations (user_id, resume_id, kind, model, counted, status, created_at)
  values ('${A}', '${resumeA}', 'summary', 'm', true, 'ok', now() - interval '200 days'),
         ('${A}', '${resumeA}', 'summary', 'm', true, 'ok', now())`)
r = await db.query(`select public.prune_ai_logs() as n`)
check('prune_ai_logs removes logs older than 180 days only', r.rows[0].n === 1, JSON.stringify(r.rows))
await db.exec(`insert into public.resume_versions (resume_id, user_id, revision, content, settings, template_id, reason, created_at)
  select '${resumeA}', '${A}', g, '{}', '{}', 'standard', 'autosave', now() - interval '30 days' + g * interval '1 minute'
    from generate_series(1, 55) g`)
r = await db.query(`select public.prune_versions() as n`)
check('prune_versions keeps the newest 50', r.rows[0].n === 5, JSON.stringify(r.rows))
r = await as(A, `select public.prune_versions()`)
check('user cannot run prune jobs', /permission denied/.test(r.error ?? ''), r.error)
r = await db.query(`select public.prune_housekeeping() as j`)
check('prune_housekeeping runs', typeof r.rows[0].j === 'object', JSON.stringify(r.rows))

await db.exec(`delete from auth.users where id = '${A}'`)
r = await db.query(`select (select count(*) from public.resumes where user_id = '${A}')::int as resumes,
  (select count(*) from public.target_jobs where user_id = '${A}')::int as targets,
  (select count(*) from public.usage_counters where user_id = '${A}')::int as usage,
  (select count(*) from public.profiles where id = '${A}')::int as profiles`)
const c = r.rows[0]
check('deleting the user removes all their rows', c.resumes + c.targets + c.usage + c.profiles === 0, JSON.stringify(c))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
