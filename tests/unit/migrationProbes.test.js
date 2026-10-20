import { describe, it, expect } from 'vitest';
import { extractProbes, probeKey, classifyProbes } from '../../db/migrate.js';

const EMPTY_CATALOG = {
  table: new Set(),
  index: new Set(),
  policy: new Set(),
  function: new Set(),
  column: new Set(),
  trigger: new Set(),
  type: new Set(),
  extension: new Set(),
  rls: new Set(),
};

function keys(sql) {
  return extractProbes(sql)
    .map((probe) => `${probe.kind}:${probeKey(probe)}`)
    .sort();
}

describe('extractProbes', () => {
  it('reads tables, policies, columns, functions, indexes and RLS', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS public.matches (id uuid);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_matches ON public.matches (id);
      CREATE POLICY "users read own matches" ON public.matches FOR SELECT USING (true);
      ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS score integer;
      ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
      CREATE OR REPLACE FUNCTION public.credit_grant(p_user uuid) RETURNS void
        AS $$ BEGIN RETURN; END; $$ LANGUAGE plpgsql;
    `;

    expect(keys(sql)).toEqual([
      'column:public.matches.score',
      'function:public.credit_grant',
      'index:public.uq_matches',
      'policy:public.matches.users read own matches',
      'rls:public.matches',
      'table:public.matches',
    ]);
  });

  it('defaults unqualified names to the public schema', () => {
    expect(keys('CREATE TABLE schema_migrations (version text primary key);')).toEqual([
      'table:public.schema_migrations',
    ]);
  });

  it('ignores commented-out DDL', () => {
    const sql = `
      -- CREATE TABLE commented_out (id int);
      /* CREATE POLICY hidden ON whatever FOR SELECT USING (true); */
      CREATE TABLE real_table (id int);
    `;
    expect(keys(sql)).toEqual(['table:public.real_table']);
  });

  it('does not treat an unnamed index as an index called "on"', () => {
    expect(keys('CREATE INDEX ON jobs (posted_at);')).toEqual([]);
  });

  it('preserves the case of quoted policy names (pg_policies keeps it)', () => {
    expect(
      keys('CREATE POLICY "Users read own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);')
    ).toEqual(['policy:public.user_profiles.Users read own profile']);
  });

  it('keys triggers by their table schema, including auth.users', () => {
    expect(
      keys(`CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`)
    ).toEqual(['trigger:auth.users.on_auth_user_created']);
  });

  it('keys multi-line public triggers by schema and table', () => {
    expect(
      keys(`DROP TRIGGER IF EXISTS notification_queue_updated_at ON notification_queue;
        CREATE TRIGGER notification_queue_updated_at
          BEFORE UPDATE ON notification_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at();`)
    ).toEqual(['trigger:public.notification_queue.notification_queue_updated_at']);
  });

  it('deduplicates identical probes', () => {
    const sql = `
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS freshness text;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS freshness text;
    `;
    expect(keys(sql)).toEqual(['column:public.jobs.freshness']);
  });
});

describe('classifyProbes', () => {
  const probes = extractProbes(`
    CREATE TABLE matches (id uuid);
    ALTER TABLE matches ADD COLUMN score integer;
  `);

  const fullCatalog = {
    ...EMPTY_CATALOG,
    table: new Set(['public.matches']),
    column: new Set(['public.matches.score']),
  };

  const partialCatalog = { ...EMPTY_CATALOG, table: new Set(['public.matches']) };

  it('is applied when the ledger agrees and every object exists', () => {
    const result = classifyProbes('20260706120000_x', probes, new Set(['20260706120000_x']), fullCatalog);
    expect(result).toMatchObject({ state: 'applied', tracked: true, probes: 2, present: 2 });
  });

  it('is applied-untracked when objects exist but the ledger is empty', () => {
    expect(classifyProbes('20260706120000_x', probes, new Set(), fullCatalog).state).toBe('applied-untracked');
  });

  it('is pending when nothing exists and the ledger is empty', () => {
    expect(classifyProbes('20260706120000_x', probes, new Set(), EMPTY_CATALOG).state).toBe('pending');
  });

  it('is drifted when the ledger claims applied but objects are gone', () => {
    expect(classifyProbes('20260706120000_x', probes, new Set(['20260706120000_x']), EMPTY_CATALOG).state).toBe(
      'drifted'
    );
  });

  it('is partial when only some objects exist', () => {
    const result = classifyProbes('20260706120000_x', probes, new Set(), partialCatalog);
    expect(result).toMatchObject({ state: 'partial', present: 1, probes: 2 });
    expect(result.missing).toEqual(['column: public.matches.score']);
  });

  it('reports nothing missing when everything exists', () => {
    expect(classifyProbes('20260706120000_x', probes, new Set(), fullCatalog).missing).toEqual([]);
  });

  it('is unverifiable for data-only migrations that are not tracked', () => {
    expect(classifyProbes('20260706230000_seed', [], new Set(), EMPTY_CATALOG).state).toBe('unverifiable');
  });

  it('is ledger-only for data-only migrations that are tracked', () => {
    expect(classifyProbes('20260706230000_seed', [], new Set(['20260706230000_seed']), EMPTY_CATALOG).state).toBe(
      'ledger-only'
    );
  });
});
