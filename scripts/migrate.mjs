#!/usr/bin/env node
// Applies supabase/migrations/*.sql to the database in DATABASE_URL, in order,
// each in its own transaction, skipping the ones already applied.
//
//   npm run db:migrate            apply what's pending
//   npm run db:migrate -- --dry   list what would run
//
// DATABASE_URL is the Supabase "Session pooler" or direct connection string
// (Project Settings → Database). Applied versions are recorded in
// supabase_migrations.schema_migrations, the table the Supabase CLI uses, so
// `supabase db push` agrees with this script if you switch to the CLI later.

import { readFileSync, readdirSync } from "node:fs";
import postgres from "postgres";

try {
  process.loadEnvFile(".env.local");
} catch {}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
const sql = postgres(url, { max: 1, onnotice: () => {}, ssl: url.includes("localhost") ? false : "require" });

try {
  await sql`create schema if not exists supabase_migrations`;
  await sql`create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text)`;
  // Applied by this script (version "0001") or by the Supabase CLI or MCP
  // connector (a timestamp version, with the name "init", "backend", ...).
  const rows = await sql`select version, name from supabase_migrations.schema_migrations`;
  const done = new Set(rows.flatMap((r) => [r.version, r.name]));
  const pending = files.filter((f) => {
    const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
    return !done.has(version) && !done.has(rest.join("_"));
  });

  if (!pending.length) console.log(`Up to date (${files.length} migrations).`);
  for (const f of pending) {
    const [version, ...rest] = f.replace(/\.sql$/, "").split("_");
    if (process.argv.includes("--dry")) {
      console.log(`would apply ${f}`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(new URL(f, dir), "utf8"));
      await tx`insert into supabase_migrations.schema_migrations (version, name) values (${version}, ${rest.join("_")})`;
    });
    console.log(`applied ${f}`);
  }
} catch (e) {
  console.error(`Migration failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
