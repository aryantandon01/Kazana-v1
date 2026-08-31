# Testing

## Purpose

Test strategy, tooling, and quality gates for Kazana from prototype through production.

---

## Testing pyramid (target)

```
        ┌─────────┐
        │  E2E    │  Few critical paths (Playwright / Detox)
        ├─────────┤
        │ Integr. │  API + DB (staging Supabase)
        ├─────────┤
        │  Unit   │  Many — utils, validation, scoring
        └─────────┘
```

**Current prototype:** Minimal automated tests — manual QA primary. This is technical debt acknowledged for Phase 1.

---

## What to test by subsystem

| Subsystem | Unit | Integration | E2E |
|-----------|------|-------------|-----|
| Resume form validation | Zod schemas | API POST /resumes | Add resume flow |
| Discover filters | Filter pure functions | GET /resumes | Filter + open PDF |
| RLS policies | — | SQL policy tests | — |
| Ingestion normalize | Per-source adapters | Worker + staging DB | — |
| Matching scores | Scoring function | Batch job | Push received |
| Auth | — | OAuth redirect | Login Google |

---

## Recommended tooling

| Layer | Tool | Why |
|-------|------|-----|
| Unit | Vitest | Vite-native, fast |
| Component | React Testing Library | User-centric |
| API | Vitest + supertest or MSW | Route testing |
| E2E web | Playwright | Reliable, CI-friendly |
| E2E mobile | Detox or Maestro | Expo compatible |
| RLS | Supabase pgTAP or manual SQL scripts | Policy verification |

---

## Critical test cases (Resume Vault)

### Privacy

- [ ] Discover API/response does NOT include `name` field
- [ ] User A cannot update/delete User B's resume
- [ ] Search does not match private `name` column

### Functional

- [ ] Create resume with required fields only
- [ ] Auto-generate name "Resume N" when blank
- [ ] Multi-company array stored and displayed
- [ ] PDF upload and modal view
- [ ] Pagination shows correct page window + Last

### Auth

- [ ] Unauthenticated redirect from /add-resume
- [ ] Google OAuth completes on localhost (manual)

---

## CI quality gates (target)

| Gate | Command |
|------|---------|
| Lint | `npm run lint` |
| Typecheck | `tsc --noEmit` |
| Unit tests | `npm test` |
| Build | `npm run build` |
| E2E (nightly) | `playwright test` |

---

## Test data

- Use isolated Supabase **staging** project
- Seed scripts for companies/countries/universities subset
- Factory functions for resumes — never production data in tests

---

## Manual QA checklist (prototype)

Before sharing prototype:

1. Discover loads with RLS policies applied
2. Filters return expected results
3. Login email + Google (with correct redirect URLs)
4. Add → appears in My Resumes and Discover
5. Edit and delete with confirmation
6. Logout confirmation modal

---

## Assumptions

- Staging Supabase available for integration tests
- E2E tests run against staging, not production

---

## Future expansion

- Visual regression (Chromatic)
- Load testing ingestion workers (k6)
- Contract tests between mobile and API (Pact)

---

## Known limitations

- No automated test suite in prototype repo today
- RLS testing requires DB instance

---

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Testing only happy path | Add 403/401 cases |
| E2E against production | Use staging |
| Flaky tests with live OAuth | Mock auth in CI |

---

## Related documents

- [contributing.md](./contributing.md)
- [api.md](./api.md)
- [security.md](./security.md)
