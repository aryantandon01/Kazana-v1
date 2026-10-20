#!/usr/bin/env node
/**
 * Migration runner + live schema status for the Supabase project.
 *
 * Preferred transport: a direct Postgres connection (`DATABASE_URL`), which can
 * introspect pg_catalog and execute DDL. Fallback: supabase-js, which can only
 * read public.schema_migrations through PostgREST and list pending files.
 *
 * Usage
 *   node db/migrate.js              apply pending migrations, reconcile the ledger
 *   node db/migrate.js --status     read-only: what is actually applied?
 *   node db/migrate.js --dry-run    print the plan, change nothing
 *   node db/migrate.js --json       machine-readable status
 *   node db/migrate.js --diff       list the exact objects a partial file is missing
 *   node db/migrate.js --force      re-run partial / drifted / unverifiable files
 *   node db/migrate.js --record <v> mark data-only migrations applied without executing
 *   node db/migrate.js --strict     exit 1 when anything is not applied
 *
 * `DATABASE_URL` comes from Supabase Dashboard → Settings → Database →
 * Connection string. Use the direct connection (port 5432) or the session
 * pooler for migrations — transaction-mode pooling breaks multi-statement DDL.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, 'migrations');
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
const positionals = argv.filter((arg) => !arg.startsWith('--'));
const recordVersions = [
  ...positionals,
  ...argv.filter((arg) => arg.startsWith('--record=')).map((arg) => arg.slice('--record='.length)),
];

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

const DB_URL =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  '';

function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function connect() {
  const { default: pg } = await import('pg');
  const localTarget = /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL);
  const explicitSslMode = /[?&]sslmode=/.test(DB_URL);
  const client = new pg.Client({
    connectionString: DB_URL,
    // Supabase terminates TLS with its own CA; let pg parse sslmode when the
    // URL sets it, otherwise disable verification for the managed endpoint.
    ssl: localTarget || explicitSslMode ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

// ---------------------------------------------------------------------------
// Schema probes
//
// Each migration is fingerprinted by the objects it creates. After loading the
// live catalog we can answer "is this migration applied?" without trusting the
// ledger, which is the whole point: SQL Editor runs never wrote the ledger.
// ---------------------------------------------------------------------------

const IDENT = '("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)';
const QUALIFIED = `${IDENT}(?:\\s*\\.\\s*${IDENT})?`;

const PROBE_PATTERNS = [
  {
    kind: 'table',
    re: new RegExp(`\\bcreate\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${QUALIFIED}`, 'gi'),
    map: (m) => splitQualified(m[1], m[2]),
  },
  {
    kind: 'rls',
    re: new RegExp(
      `\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${QUALIFIED}\\s+enable\\s+row\\s+level\\s+security`,
      'gi'
    ),
    map: (m) => splitQualified(m[1], m[2]),
  },
  {
    kind: 'index',
    re: new RegExp(
      `\\bcreate\\s+(?:unique\\s+)?index\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?${QUALIFIED}`,
      'gi'
    ),
    map: (m) => {
      const probe = splitQualified(m[1], m[2]);
      return probe.name === 'on' ? null : probe;
    },
  },
  {
    kind: 'policy',
    re: new RegExp(`\\bcreate\\s+policy\\s+${IDENT}\\s+on\\s+${QUALIFIED}`, 'gi'),
    map: (m) => {
      const table = splitQualified(m[2], m[3]);
      return { schema: table.schema, table: table.name, name: unquote(m[1]) };
    },
  },
  {
    kind: 'function',
    re: new RegExp(
      `\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+${QUALIFIED}`,
      'gi'
    ),
    map: (m) => splitQualified(m[1], m[2]),
  },
  {
    kind: 'column',
    re: new RegExp(
      `\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${QUALIFIED}\\s+add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?${IDENT}`,
      'gi'
    ),
    map: (m) => {
      const table = splitQualified(m[1], m[2]);
      return { schema: table.schema, table: table.name, name: unquote(m[3]) };
    },
  },
  {
    kind: 'trigger',
    // Capture the table too: triggers are namespaced by their table, and some
    // live outside `public` (e.g. `on_auth_user_created` on `auth.users`).
    re: new RegExp(
      `\\bcreate\\s+(?:or\\s+replace\\s+)?trigger\\s+${IDENT}[\\s\\S]*?\\bon\\s+${QUALIFIED}`,
      'gi'
    ),
    map: (m) => {
      const table = splitQualified(m[2], m[3]);
      return { schema: table.schema, table: table.name, name: unquote(m[1]) };
    },
  },
  {
    kind: 'type',
    re: new RegExp(`\\bcreate\\s+type\\s+${QUALIFIED}`, 'gi'),
    map: (m) => splitQualified(m[1], m[2]),
  },
  {
    kind: 'extension',
    re: new RegExp(`\\bcreate\\s+extension\\s+(?:if\\s+not\\s+exists\\s+)?${IDENT}`, 'gi'),
    map: (m) => ({ name: unquote(m[1]) }),
  },
];

function unquote(raw) {
  const value = String(raw).trim();
  // Quoted identifiers keep their case in pg_catalog (e.g. policy
  // "Users read own profile"); unquoted ones are folded to lowercase by Postgres.
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/""/g, '"');
  }
  return value.toLowerCase();
}

function splitQualified(first, second) {
  // Group 1 is the schema when the identifier is qualified; group 2 is the name.
  return second
    ? { schema: unquote(first), name: unquote(second) }
    : { schema: 'public', name: unquote(first) };
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function extractProbes(sql) {
  const source = stripComments(sql);
  const probes = [];
  const seen = new Set();
  for (const { kind, re, map } of PROBE_PATTERNS) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source))) {
      const probe = map(match);
      if (!probe || !probe.name) continue;
      const key = `${kind}:${probe.schema || ''}:${probe.table || ''}:${probe.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      probes.push({ kind, ...probe });
    }
  }
  return probes;
}

function probeKey(probe) {
  switch (probe.kind) {
    case 'policy':
    case 'column':
    case 'trigger':
      return `${probe.schema}.${probe.table}.${probe.name}`;
    case 'extension':
      return probe.name;
    default:
      return `${probe.schema}.${probe.name}`;
  }
}

async function loadCatalog(client) {
  // Sequential on purpose: one pg.Client multiplexes statements, and issuing
  // concurrent client.query() calls is deprecated (removed in pg@9).
  const rows = async (sql) => (await client.query(sql)).rows;

  const tables = await rows('select schemaname, tablename from pg_tables');
  const indexes = await rows('select schemaname, indexname from pg_indexes');
  const policies = await rows('select schemaname, tablename, policyname from pg_policies');
  const functions = await rows(
    'select n.nspname as schemaname, p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace'
  );
  const columns = await rows(
    'select table_schema as schemaname, table_name as tablename, column_name as name from information_schema.columns'
  );
  const triggers = await rows(
    'select n.nspname as schemaname, c.relname as tablename, t.tgname as name from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal'
  );
  const types = await rows(
    'select n.nspname as schemaname, t.typname as name from pg_type t join pg_namespace n on n.oid = t.typnamespace'
  );
  const extensions = await rows('select extname as name from pg_extension');
  const rlsTables = await rows(
    `select n.nspname as schemaname, c.relname as tablename from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'p') and c.relrowsecurity`
  );

  const set = (list, keyFn) => new Set(list.map(keyFn));
  return {
    table: set(tables, (r) => `${r.schemaname}.${r.tablename}`),
    index: set(indexes, (r) => `${r.schemaname}.${r.indexname}`),
    policy: set(policies, (r) => `${r.schemaname}.${r.tablename}.${r.policyname}`),
    function: set(functions, (r) => `${r.schemaname}.${r.name}`),
    column: set(columns, (r) => `${r.schemaname}.${r.tablename}.${r.name}`),
    trigger: set(triggers, (r) => `${r.schemaname}.${r.tablename}.${r.name}`),
    type: set(types, (r) => `${r.schemaname}.${r.name}`),
    extension: set(extensions, (r) => r.name),
    rls: set(rlsTables, (r) => `${r.schemaname}.${r.tablename}`),
  };
}

function hasProbe(catalog, probe) {
  const bucket = catalog[probe.kind];
  return bucket ? bucket.has(probeKey(probe)) : false;
}

// ---------------------------------------------------------------------------
// Classification and reporting
// ---------------------------------------------------------------------------

const LABELS = {
  applied: 'applied',
  'applied-untracked': 'applied, missing from ledger',
  'ledger-only': 'ledger only (no schema probes)',
  pending: 'pending',
  partial: 'partial',
  drifted: 'drifted (ledger claims applied)',
  unverifiable: 'unverifiable (no schema probes)',
};

const RERUN_STATES = new Set(['partial', 'drifted', 'unverifiable']);
const SETTLED_STATES = new Set(['applied', 'ledger-only']);
// Data-only migrations have no schema probes, so `--strict` cannot judge them.
const PROBLEM_STATES = new Set(['pending', 'partial', 'drifted']);

async function loadLedger(client, table) {
  const { rows } = await client.query('select to_regclass($1) as oid', [table]);
  if (!rows[0]?.oid) return null;
  const result = await client.query(`select version from ${table}`);
  return new Set(result.rows.map((r) => r.version));
}

function classifyProbes(version, probes, ledger, catalog) {
  const missing = probes.filter((p) => !hasProbe(catalog, p));
  const present = probes.length - missing.length;
  const tracked = Boolean(ledger?.has(version));

  let state;
  if (probes.length === 0) state = tracked ? 'ledger-only' : 'unverifiable';
  else if (present === probes.length) state = tracked ? 'applied' : 'applied-untracked';
  else if (present === 0) state = tracked ? 'drifted' : 'pending';
  else state = 'partial';

  return {
    version,
    tracked,
    probes: probes.length,
    present,
    state,
    missing: missing.map((p) => `${p.kind}: ${probeKey(p)}`),
  };
}

function classify(file, ledger, catalog) {
  const version = file.replace(/\.sql$/, '');
  const probes = extractProbes(readFileSync(join(migrationsDir, file), 'utf8'));
  return { file, ...classifyProbes(version, probes, ledger, catalog) };
}

function render(rows, repoLedger, cliLedger) {
  const width = Math.max(20, ...rows.map((r) => r.version.length));
  console.log(`Migration status — ${rows.length} files in db/migrations\n`);
  for (const row of rows) {
    const detail = row.probes ? ` [${row.present}/${row.probes} objects]` : '';
    console.log(`  ${row.version.padEnd(width)}  ${LABELS[row.state]}${detail}`);
    if (flags.has('--diff')) {
      for (const item of row.missing || []) console.log(`      missing → ${item}`);
    }
  }

  const counts = {};
  for (const row of rows) counts[row.state] = (counts[row.state] || 0) + 1;
  console.log(
    '\nSummary: ' +
      Object.entries(counts)
        .map(([state, count]) => `${count} ${LABELS[state]}`)
        .join(' · ')
  );
  console.log(
    `Ledger: public.schema_migrations=${repoLedger ? `${repoLedger.size} rows` : 'missing'} · ` +
      `supabase_migrations.schema_migrations=${cliLedger ? `${cliLedger.size} rows` : 'missing'}`
  );
  console.log(
    'Legend: applied = ledger and objects agree · applied-untracked = objects exist, run apply to backfill · ' +
      'pending = no objects found · partial = some objects found · drifted = ledger stale · ' +
      'unverifiable = data-only, ledger cannot judge · ledger only = data-only, recorded'
  );
}

async function report(client) {
  const catalog = await loadCatalog(client);
  const repoLedger = await loadLedger(client, 'public.schema_migrations');
  const cliLedger = await loadLedger(client, 'supabase_migrations.schema_migrations');
  const rows = listMigrations().map((file) => classify(file, repoLedger, catalog));

  if (flags.has('--json')) {
    console.log(
      JSON.stringify(
        {
          migrations: rows.map(({ version, state, tracked, probes, present, missing }) => ({
            version,
            state,
            tracked,
            probes,
            present,
            missing,
          })),
          ledger: {
            repo: repoLedger ? [...repoLedger].sort() : null,
            cli: cliLedger ? [...cliLedger].sort() : null,
          },
          ok: rows.every((row) => !PROBLEM_STATES.has(row.state)),
        },
        null,
        2
      )
    );
  } else {
    render(rows, repoLedger, cliLedger);
  }

  if (flags.has('--strict') && rows.some((row) => PROBLEM_STATES.has(row.state))) {
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

async function runMigration(client, row) {
  const sql = readFileSync(join(migrationsDir, row.file), 'utf8');
  // DDL is transactional in Postgres; CREATE INDEX CONCURRENTLY is the exception.
  const transactional = !/\bconcurrently\b/i.test(sql);
  try {
    if (transactional) await client.query('begin');
    await client.query(sql);
    await client.query(
      'insert into public.schema_migrations (version) values ($1) on conflict (version) do nothing',
      [row.version]
    );
    if (transactional) await client.query('commit');
  } catch (err) {
    if (transactional) await client.query('rollback').catch(() => {});
    throw new Error(`${row.version}: ${err.message}`);
  }
}

async function record(client, version) {
  await client.query(
    'insert into public.schema_migrations (version) values ($1) on conflict (version) do nothing',
    [version]
  );
}

/**
 * Backfill the ledger for migrations that have no schema footprint (seeds,
 * UPDATE/DELETE fixes) and therefore cannot be verified by introspection.
 * The SQL is deliberately NOT executed: some of these files (e.g. the LinkedIn
 * removal DELETE) are destructive if replayed.
 */
async function recordOnly(client, rawVersions, dryRun = false) {
  const known = new Set(listMigrations().map((file) => file.replace(/\.sql$/, '')));
  const versions = [...new Set(rawVersions.map((v) => v.replace(/\.sql$/, '')))];

  if (!versions.length) {
    throw new Error('--record needs at least one version, e.g. --record 20260706230000');
  }
  for (const version of versions) {
    if (!known.has(version)) throw new Error(`Unknown migration: ${version}`);
  }

  if (!dryRun) {
    await client.query(`create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`);
  }

  for (const version of versions) {
    if (!dryRun) await record(client, version);
    console.log(`  ${dryRun ? '~' : '✓'} ${version} — ${dryRun ? 'would record' : 'recorded without executing'}`);
  }
}

async function apply(client) {
  const dryRun = flags.has('--dry-run');
  if (!dryRun) {
    await client.query(`create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`);
  }

  const catalog = await loadCatalog(client);
  const repoLedger = await loadLedger(client, 'public.schema_migrations');
  const rows = listMigrations().map((file) => classify(file, repoLedger, catalog));

  const plan = [];
  for (const row of rows) {
    if (SETTLED_STATES.has(row.state)) continue;
    if (row.state === 'applied-untracked') {
      plan.push({ ...row, action: 'record' });
    } else if (RERUN_STATES.has(row.state) && !flags.has('--force')) {
      plan.push({ ...row, action: 'skip' });
    } else {
      plan.push({ ...row, action: 'run' });
    }
  }

  if (!plan.length) {
    console.log('All migrations already applied and recorded.');
    return;
  }

  for (const item of plan) {
    if (item.action === 'skip') {
      console.log(`  ! ${item.version} — ${LABELS[item.state]}; re-run with --force to apply`);
    } else if (item.action === 'record') {
      if (dryRun) {
        console.log(`  ~ ${item.version} — would record (objects already exist)`);
      } else {
        await record(client, item.version);
        console.log(`  ✓ ${item.version} — recorded (objects already exist)`);
      }
    } else if (dryRun) {
      console.log(`  → ${item.version} — would apply (${item.state})`);
    } else {
      console.log(`  → ${item.version} — applying...`);
      await runMigration(client, item);
      console.log(`  ✓ ${item.version}`);
    }
  }

  if (!dryRun) await report(client);
}

// ---------------------------------------------------------------------------
// Fallback: ledger-only view through supabase-js (no DATABASE_URL)
// ---------------------------------------------------------------------------

async function fallback() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const files = listMigrations();

  console.log('DATABASE_URL is not set — falling back to the ledger-only view.');
  console.log('Set DATABASE_URL (Dashboard → Settings → Database → Connection string)');
  console.log('to introspect the live schema and apply migrations.\n');

  if (!url || !key) {
    console.log('No DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    console.log(`Cannot determine applied state. ${files.length} migration files found:`);
    for (const file of files) console.log(`  → db/migrations/${file}`);
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.from('schema_migrations').select('version');
  if (error?.code === '42P01') {
    console.log('public.schema_migrations does not exist — treat every file as pending.');
    return;
  }
  if (error) throw error;

  const applied = new Set((data || []).map((row) => row.version));
  const pending = files.filter((file) => !applied.has(file.replace(/\.sql$/, '')));

  if (!pending.length) {
    console.log('All migrations are recorded in schema_migrations.');
    console.log('Warning: the ledger is not proof — SQL Editor runs bypass it.');
    return;
  }

  console.log(`Recorded: ${applied.size} · Not recorded: ${pending.length}\n`);
  for (const file of pending) console.log(`  → db/migrations/${file}`);
}

async function main() {
  if (flags.has('--debug-probes')) {
    for (const file of listMigrations()) {
      const probes = extractProbes(readFileSync(join(migrationsDir, file), 'utf8'));
      console.log(`${file}  (${probes.length} probes)`);
      for (const probe of probes) console.log(`    ${probe.kind}: ${probeKey(probe)}`);
    }
    return;
  }

  if (!DB_URL) {
    if (flags.has('--record')) {
      throw new Error('--record needs DATABASE_URL: it writes to public.schema_migrations.');
    }
    await fallback();
    return;
  }

  const client = await connect();
  try {
    if (flags.has('--record')) {
      await recordOnly(client, recordVersions, flags.has('--dry-run'));
      return;
    }
    const readonly = flags.has('--status') || flags.has('--json') || flags.has('--dry-run');
    if (readonly) await report(client);
    if (flags.has('--status') || flags.has('--json')) return;
    await apply(client);
  } finally {
    await client.end();
  }
}

export { extractProbes, probeKey, hasProbe, classifyProbes, classify, loadCatalog };

const isDirectRun =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}




