# Security

## Purpose

Security model, threat assumptions, and required controls for Kazana.

---

## Threat model (summary)

| Threat | Mitigation |
|--------|------------|
| Unauthorized resume access | RLS + owner checks on mutations |
| Data leak via Discover | Strip private fields (`name`); public SELECT policy intentional |
| Credential theft | Supabase Auth; no custom password storage |
| Service role exposure | Server/workers only |
| OAuth redirect hijack | Whitelist redirect URLs in Supabase |
| SQL injection | Parameterized queries via Supabase client |
| XSS | React escaping; sanitize HTML in job descriptions (future) |
| Abuse / scraping | Rate limits on API (target); pagination |

---

## Authentication

| Method | Provider | Notes |
|--------|----------|-------|
| Email/password | Supabase Auth | Email confirmation recommended |
| Google OAuth | Supabase Auth | Configure redirect URLs per environment |

**Session:** JWT access token in client; verify on API routes (target).

---

## Authorization model

### Row Level Security (RLS)

**MUST** enable RLS on all tables exposed to `anon` or `authenticated` roles.

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `resumes` | Public (metadata) | Owner | Owner | Owner |
| `companies`, `countries`, `universities` | Public | Deny | Deny | Deny |
| `jobs` (future) | Public | Service only | Service only | Service only |
| `user_profiles` (future) | Owner | Owner | Owner | Owner |

Policy files in repo:

- `rls_policies_lookup_tables.sql`
- `rls_policies_resumes.sql`

### Application-layer checks (target API)

Defense in depth — API validates ownership even if RLS exists.

---

## Data classification

| Class | Examples | Handling |
|-------|----------|----------|
| **Public** | Job family, level, companies on resume | Discover OK |
| **User-private** | `resumes.name`, email | Owner + RLS |
| **Sensitive** | PDF content | Storage URLs; no public listing of paths |
| **Secret** | Service role, Stripe keys | Server env only |

---

## Storage security

| Bucket | Policy |
|--------|--------|
| `resumes` | Upload requires auth; public read for PDF preview (product decision) |

**Future consideration:** Signed URLs with TTL instead of permanent public URLs for PDFs.

---

## Privacy requirements (product-driven)

1. `resumes.name` MUST NOT appear on Discover, in search, or in PDF modal for other users
2. Users MUST be able to delete their data
3. Privacy Policy MUST disclose what is public (planned — legal page)

---

## Secrets management

See [deployment.md](./deployment.md). **Never commit:**

- `.env` with keys
- Service role key
- Stripe secret key

`.gitignore` MUST include `.env*`.

---

## Dependency security

- Run `npm audit` periodically
- Enable Dependabot (recommended)
- Pin major versions; test upgrades in staging

---

## Compliance (future)

- GDPR: data export/delete endpoints
- CCPA: similar user rights
- Job source licenses: per-source terms in `job_sources` table

---

## Incident response (lightweight)

1. Rotate compromised keys in Supabase dashboard
2. Review Auth logs for anomalous sign-ins
3. Deploy fix; notify users if data breach confirmed

---

## Common mistakes

| Mistake | Impact |
|---------|--------|
| RLS enabled, no policies | App appears broken OR over-permissive if misconfigured |
| Google OAuth without localhost redirect | Login fails in dev |
| Logging full JWT or PII | Log leakage |

---

## Related documents

- [database.md](./database.md)
- [deployment.md](./deployment.md)
- [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)
