#!/usr/bin/env node
/**
 * Audit: does every auth user have a user_credits row?
 *
 * Read-only. Reports users missing a cached balance row and, with --fix,
 * backfills them (row + Free-plan welcome grant) using the same logic as the
 * handle_new_user() trigger / migration backfill.
 *
 * Usage:
 *   node scripts/verify-user-credits.mjs
 *   node scripts/verify-user-credits.mjs --fix
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FIX = process.argv.includes('--fix');

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function listAllUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function listAllCreditRows() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('user_credits')
      .select('user_id, available_credits, reserved_credits')
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

async function main() {
  const users = await listAllUsers();
  const credits = await listAllCreditRows();
  const have = new Set(credits.map((c) => c.user_id));
  const missing = users.filter((u) => !have.has(u.id));

  console.log(`auth.users            : ${users.length}`);
  console.log(`user_credits rows     : ${credits.length}`);
  console.log(`users WITH credits    : ${users.length - missing.length}`);
  console.log(`users MISSING credits : ${missing.length}`);

  if (missing.length && !FIX) {
    console.log('\nMissing (up to 10):');
    missing.slice(0, 10).forEach((u) => console.log(`  ${u.id}  ${u.email || '(no email)'}`));
    console.log('\nRe-run with --fix to backfill.');
  }

  if (missing.length && FIX) {
    const { data: freePlan } = await sb
      .from('plans')
      .select('welcome_credit_grant')
      .eq('slug', 'free')
      .eq('active', true)
      .maybeSingle();
    const welcome = Number(freePlan?.welcome_credit_grant) || 0;
    console.log(`\n--fix: backfilling (free welcome grant = ${welcome})…`);

    let ok = 0;
    for (const u of missing) {
      const { error: e1 } = await sb
        .from('user_credits')
        .insert({ user_id: u.id, available_credits: 0, reserved_credits: 0 });
      if (e1 && !String(e1.message).includes('duplicate')) {
        console.error(`  FAIL ${u.id}: ${e1.message}`);
        continue;
      }

      if (welcome > 0) {
        const { error: e2 } = await sb.rpc('credit_grant', {
          p_user_id: u.id,
          p_amount: welcome,
          p_type: 'grant',
          p_feature: null,
          p_reference_id: `welcome:${u.id}`,
          p_idempotency_key: `welcome:${u.id}`,
          p_expires_at: null,
          p_metadata: { reason: 'welcome_grant' },
          p_created_by: 'system',
        });
        if (e2) {
          console.error(`  grant FAIL ${u.id}: ${e2.message}`);
          continue;
        }
      }
      ok += 1;
    }
    console.log(`backfilled ${ok}/${missing.length}`);
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
