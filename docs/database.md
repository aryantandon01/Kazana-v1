# Database

## Purpose

Defines PostgreSQL schema strategy, Supabase configuration, Row Level Security (RLS), migrations, and storage.

---

## Technology

| Component | Choice | Why |
|-----------|--------|-----|
| Database | Supabase PostgreSQL | Relational model, RLS, managed ops |
| Migrations | SQL files in repo → `npm run db:migrate` (direct Postgres) or Supabase SQL Editor | Versioned, verified schema |
| File storage | Supabase Storage bucket `resumes` | Integrated auth policies |
| Auth users | `auth.users` (Supabase) | OAuth + email |

---

## Entity relationship (current + planned)

```
auth.users
    │
    │ 1:N
    ▼
resumes ──────────────┐
    │                 │
    │ uses            │ references (text / FK future)
    ▼                 ▼
companies          countries
(universities)     job_family (constant + optional FK)

--- PLANNED ---
users_profile ──► notification_preferences
       │
       └──► matches ◄── jobs ◄── job_sources
```

**Status:** everything in the block above is **implemented** — the `--- PLANNED ---` label is stale. `user_profiles`, `matches`, `notification_preferences`, `notification_queue`, and `device_tokens` all ship in `20260706120000_discovery_matching_notifications.sql`.

---

## Core tables (Resume Vault — implemented / in repo SQL)

### `resumes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid FK → auth.users | Owner |
| `companies` | text[] | Companies that passed screening |
| `job_family` | text | e.g. `software_engineer` |
| `level` | text | L1–L9 |
| `years_of_experience` | integer | Also legacy `years` in some rows |
| `country` | text | Optional |
| `university` | text | Optional |
| `name` | text | **Private** — owner only |
| `file_url` | text | Storage path or public URL |
| `created_at` | timestamptz | |

### Lookup tables

| Table | Purpose | RLS (required) |
|-------|---------|----------------|
| `companies` | Searchable company names | Public SELECT |
| `countries` | Country names | Public SELECT |
| `universities` | University names | Public SELECT |

SQL seed files in repo root: `create_companies_table.sql`, `create_countries_table.sql`, `create_universities_table.sql`.

### RLS policies (MUST run after enabling RLS)

| Table | Policy file | Summary |
|-------|-------------|---------|
| companies, countries, universities | `rls_policies_lookup_tables.sql` | `SELECT` for all |
| resumes | `rls_policies_resumes.sql` | Public `SELECT`; owner `INSERT`/`UPDATE`/`DELETE` |

**Common failure:** Enabling RLS without policies → **empty Discover table** and broken dropdowns.

---

## Planned tables (Job Discovery)

| Table | Purpose | Status |
|-------|---------|--------|
| `job_sources` | Feed metadata, license, cron schedule | **Implemented** — `create_jobs_tables.sql` |
| `jobs` | Normalized job postings | **Implemented** |
| `ingestion_runs` | Per-fetch observability | **Implemented** |
| `facets` / `job_facets` | Structured multi-valued attributes (Career Areas, Experience, …) | **Implemented** — `20260719090000_semantic_facets_tags.sql` |
| `tags` / `job_tags` | Semantic descriptors with provenance (employer / ai / community) | **Implemented** — same migration |
| `user_profiles` | Preferences, target roles, locations | Partial (visit tracking) |
| `matches` | user_id + job_id + score + notified_at | **Implemented** — `20260706120000_discovery_matching_notifications.sql` |
| `notification_preferences` | Per-channel opt-in, thresholds, quiet hours | **Implemented** — same migration; WhatsApp columns in `20261110090000_whatsapp_notifications.sql` |
| `notification_queue` | Outbound notification jobs **and** per-channel delivery log | **Implemented** — same migrations (channel + `provider_message_id`) |
| `device_tokens` | Expo push tokens per user/device | **Implemented** — same migration |

SQL: `create_jobs_tables.sql`, RLS: `rls_policies_jobs.sql`, semantic: `db/migrations/20260719090000_semantic_facets_tags.sql`

See [ingestion.md](./ingestion.md) (Facets vs Tags) and [matching.md](./matching.md) for field-level detail.

---

## Storage

| Bucket | Content | Access |
|--------|---------|--------|
| `resumes` | PDF files | Public read URL for Discover preview; upload auth required |

**Path convention:** `{timestamp}_{sanitized_filename}.pdf`

---

## Migration strategy

### Checking what is actually applied

The ledger alone is not trustworthy: migrations pasted into the **Supabase SQL Editor** never write it. `npm run db:status` therefore checks **both** the ledger and the live catalog (`pg_catalog` / `information_schema`), using one probe per object a migration creates (tables, indexes, policies, functions, triggers, columns, RLS enablement).

1. Put the direct connection string in `.env` as `DATABASE_URL` (Dashboard → Settings → Database → Connection string). Use the direct connection (port 5432) or the session pooler — the transaction pooler (6543) is not suitable for multi-statement migrations.
2. Run `npm run db:status`:

| State | Meaning | Action |
|---|---|---|
| `applied` | Ledger and objects agree | none |
| `applied, missing from ledger` | Objects exist, ledger row absent | `npm run db:migrate` records it |
| `pending` | No objects found | `npm run db:migrate` applies it |
| `partial` | Some objects found | inspect, then re-run with `--force` |
| `drifted` | Ledger says applied, objects are gone | inspect, then re-run with `--force` |
| `unverifiable` | Data-only file (seeds, `UPDATE`/`DELETE` fixes); no schema probes | verify with a query, then `npm run db:record -- <version>` |
| `ledger only` | Data-only file that is already recorded | none |

3. `npm run db:migrate` applies pending files through the direct connection and writes `public.schema_migrations`. Related commands:
   - `npm run db:dry-run` — print the plan, change nothing
   - `npm run db:diff` — list the exact objects a `partial` file is missing
   - `node db/migrate.js --force` — re-run `partial` / `drifted` / `unverifiable` files
   - `npm run db:record -- <version>...` — backfill the ledger **without executing** (data-only migrations; never replays a destructive `DELETE`)
   - `node db/migrate.js --json` — machine-readable output (includes `missing` objects)
   - `npm run db:status -- --strict` — exit 1 on `pending` / `partial` / `drifted` (CI gate)

Without `DATABASE_URL` the script falls back to a read-only ledger view through `supabase-js` and prints the files that are not recorded.

### Current state (2026-10-17)

`public.schema_migrations` now holds **21 of 21** rows and `npm run db:status -- --strict` exits 0. Reconciliation found no real drift: every file either matched its probes or was a data-only migration confirmed by query.

Two probe details matter when adding migrations:

- **Policy names are case-sensitive.** `pg_policies.policyname` preserves the case of a quoted identifier, so `CREATE POLICY "Users read own profile"` must stay title-cased; an unquoted policy is folded to lowercase.
- **Triggers are keyed by `schema.table.name`.** A trigger on `auth.users` (e.g. `on_auth_user_created`) lives in the `auth` schema, not `public`.

`applied` = ledger and objects agree · `ledger only` = data-only file already recorded. The seven `ledger only` files (`20260706230000`, `20260707020000`, `20260707030000`, `20260710080000`, `20260710100000`, `20260731120000`, `20260814000000`) have no schema probes by design; `--strict` ignores them.

### Supabase CLI

Installed with `brew install supabase/tap/supabase` (v2.121.0). Optional for day-to-day work, useful for its own ledger and for drift checks.

```bash
supabase migration list --db-url "$DATABASE_URL"      # CLI ledger vs local files
supabase migration repair --db-url "$DATABASE_URL" --status applied <version>
```

The CLI keeps a **separate** ledger, `supabase_migrations.schema_migrations`. Every migration so far was applied outside the CLI, so it starts empty; use `migration repair --status applied` to adopt it after the local files are verified.

`supabase db diff`, `db pull` and `db dump` **require a running Docker daemon** (they run `pg_dump` / `migra` in containers), so they do not work on a Docker-less machine. Without Docker, use the `libpq` client tools (keg-only):

```bash
/opt/homebrew/opt/libpq/bin/pg_dump --schema-only --no-owner --no-privileges \
  "$DATABASE_URL" > /tmp/kazana-schema.sql
```

### Rule: every migration must be re-runnable

Because the SQL Editor has no version tracking, a migration can be run twice — by accident, after a partial failure, or when replaying a database from scratch. Every statement must therefore be idempotent:

| Statement | Required form |
|---|---|
| `CREATE TABLE` | `CREATE TABLE IF NOT EXISTS` |
| `CREATE INDEX` / `CREATE UNIQUE INDEX` | `... IF NOT EXISTS` |
| `ADD COLUMN` | `ADD COLUMN IF NOT EXISTS` |
| `ENABLE ROW LEVEL SECURITY` | already idempotent |
| `CREATE POLICY` | `DROP POLICY IF EXISTS <name> ON <table>;` first — Postgres has **no** `CREATE POLICY IF NOT EXISTS` |
| `ADD CONSTRAINT` | `DROP CONSTRAINT IF EXISTS <name>;` first |
| `CREATE TRIGGER` | `DROP TRIGGER IF EXISTS <name> ON <table>;` first |
| `CREATE FUNCTION` | `CREATE OR REPLACE FUNCTION` |
| seed `INSERT` | `ON CONFLICT ... DO NOTHING` / `DO UPDATE` |

Violating this rule produces `ERROR 42710: policy "<name>" for table "<table>" already exists` on the second run.

**Generated seeds:** `scripts/ingestion/generate-ats-sources-sql.js` writes the ATS source files (`20260706230000`, `20260707030000`, `20260710080000`, `20260710100000`) with explicit UUIDs plus `ON CONFLICT (slug) DO NOTHING`, so they are safe to replay. Fix the generator, not the generated SQL.

### Target (production)

1. `npm run db:migrate` on merge to `main`, with `DATABASE_URL` supplied from CI secrets
2. `npm run db:status -- --strict` as a deploy gate (fails on `pending` / `partial` / `drifted`)
3. Backward-compatible additive changes preferred
4. Destructive changes require ADR + expand-contract pattern

---

## Indexing strategy

| Table | Index | Why |
|-------|-------|-----|
| `resumes` | `(job_family)`, `(created_at DESC)` | Discover filters/sort |
| `resumes` | GIN on `companies` | Array containment filter |
| `companies` | `(name)` text pattern | AsyncSelect search |
| `jobs` | `(source_id, external_id)` UNIQUE, `(posted_at DESC)`, `(company_name)`, `(job_family)` | Idempotent ingestion + listing |
| `job_facets` | `(facet_id)`, `(job_id)` | Facet filters |
| `job_tags` | `(tag_id)`, `(job_id)`, `(tag_source)` | Tag search + provenance |

---

## Communication with other subsystems

| Consumer | Access pattern |
|----------|----------------|
| Web prototype | `supabase-js` anon key + user JWT |
| API routes | Server client with user context or service role |
| Workers | Service role (bypass RLS where needed; use explicit checks) |
| Edge Functions | Service role scoped to function |

---

## Design principles

1. **RLS on every user-facing table**
2. **Lookup tables: read-only for clients**
3. **Normalize jobs once at ingestion** — clients never parse RSS
4. **UUID primary keys** — safe distributed inserts

---

## Assumptions

- Single Supabase project per environment (dev/staging/prod)
- No multi-tenant org model in v1

---

## Future expansion

- Read replicas for Discover at scale
- Full-text search extension or external search engine
- Partition `jobs` by `posted_at` month
- Materialized views for aggregate stats

---

## Known limitations

- Client-side filtering/pagination on Discover (prototype) — does not scale to millions of rows
- Universities table very large — may need prefix search optimization

---

## Common mistakes

| Mistake | Consequence |
|---------|-------------|
| Enable RLS without policies | Zero rows returned |
| Store service role in frontend | Security breach |
| Use `companies` singular column | Schema drift; use array |
| Search `resumes.name` on Discover | Privacy violation |

---

## Related documents

- [security.md](./security.md)
- [product.md](./product.md)
- [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) (repo root)
