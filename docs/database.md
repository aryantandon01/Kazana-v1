# Database

## Purpose

Defines PostgreSQL schema strategy, Supabase configuration, Row Level Security (RLS), migrations, and storage.

---

## Technology

| Component | Choice | Why |
|-----------|--------|-----|
| Database | Supabase PostgreSQL | Relational model, RLS, managed ops |
| Migrations | SQL files in repo → Supabase SQL Editor / CLI (target: formal migration runner) | Versioned schema |
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
| `matches` | user_id + job_id + score + notified_at | Planned |
| `notification_queue` | Outbound push/email jobs | Planned |
| `device_tokens` | FCM/OneSignal tokens per user/device | Planned |

SQL: `create_jobs_tables.sql`, RLS: `rls_policies_jobs.sql`, semantic: `db/migrations/20260719090000_semantic_facets_tags.sql`

See [ingestion.md](./ingestion.md) (Facets vs Tags) and [matching.md](./matching.md) for field-level detail.

## Credits & Entitlements tables

| Table | Purpose |
|-------|---------|
| `plans` | Free/Premium catalog; welcome + monthly credit grants (configurable) |
| `plan_entitlements` | Feature access per plan (`jobs`, `matching`, `resume_optimization`, …) |
| `subscriptions` | User → plan, provider-agnostic status + billing period |
| `credit_transactions` | Append-only ledger (positive = grant/purchase/refund, negative = usage/expiration) |
| `credit_operations` | AI operation lifecycle (`reserved → consumed | refunded`) + idempotency key |
| `user_credits` | Cached balance (`available_credits ≥ 0`, `reserved_credits ≥ 0`) |
| `ai_operations` | Central AI operation catalog with configurable `credit_cost` |
| `ai_usage` | Actual provider/model/token consumption per call (unit economics) |

All credit mutations go through `SECURITY DEFINER` functions (`credit_reserve`, `credit_finalize`, `credit_release`, `credit_grant`, `credit_expire`, `credit_adjust`, `process_monthly_grants`, `release_stale_reservations`) granted **only to `service_role`**. Ledger tables have owner-read-only RLS — the client can never write. Migration: `db/migrations/20260901010000_ai_credits_entitlements.sql`. Details: [credits.md](./credits.md).

---

## Storage

| Bucket | Content | Access |
|--------|---------|--------|
| `resumes` | PDF files | Public read URL for Discover preview; upload auth required |

**Path convention:** `{timestamp}_{sanitized_filename}.pdf`

---

## Migration strategy

### Current (prototype)

1. SQL files in repository root
2. Manual execution in Supabase SQL Editor
3. Documented in `MIGRATION_GUIDE.md`

### Target (production)

1. Numbered migrations (`db/migrations/YYYYMMDDHHMMSS_description.sql`)
2. Applied via Supabase CLI or CI on merge to `main`
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
