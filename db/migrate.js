#!/usr/bin/env node
/**
 * Apply SQL migrations from db/migrations/ in filename order.
 * Tracks applied versions in schema_migrations.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');

function loadEnv() {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function getAppliedVersions() {
  const { data, error } = await supabase.from('schema_migrations').select('version');
  if (error?.code === '42P01') return new Set();
  if (error) throw error;
  return new Set((data || []).map((r) => r.version));
}

async function runMigration(version, sql) {
  console.log(`Applying ${version}...`);
  const { error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    // Fallback: run statements via REST is not available — use postgres connection note
    // Supabase JS cannot run arbitrary SQL without a DB function. Use SQL editor or pg.
    console.error(
      'Direct SQL execution requires running migrations in Supabase SQL Editor, or install pg CLI.\n' +
        'Copy db/migrations/*.sql files to SQL Editor in order.\n' +
        'Alternatively, paste this migration manually.'
    );
    throw error;
  }
  await supabase.from('schema_migrations').insert({ version });
  console.log(`  ✓ ${version}`);
}

async function main() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (!files.length) {
    console.log('No migrations found.');
    return;
  }

  let applied;
  try {
    applied = await getAppliedVersions();
  } catch {
    applied = new Set();
  }

  const pending = files.filter((f) => !applied.has(f.replace(/\.sql$/, '')));

  if (!pending.length) {
    console.log('All migrations already applied.');
    return;
  }

  console.log(`Pending migrations: ${pending.length}`);
  console.log('\n--- Manual apply required ---');
  console.log('Run each file below in Supabase SQL Editor (in order), then record:');
  console.log("INSERT INTO schema_migrations (version) VALUES ('<filename-without-sql>');\n");
  for (const file of pending) {
    console.log(`  → db/migrations/${file}`);
  }
  console.log('\nOr use: supabase db push / psql with DATABASE_URL');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
