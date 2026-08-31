# Contributing

## Purpose

How engineers and AI assistants should work in the Kazana repository.

---

## Before you code

1. Read [vision.md](./vision.md) — apply the **decision filter** (does this strengthen the assessment engine or a learning loop?).
2. Read [docs/README.md](./README.md) for the doc map and current vs target state.
3. Read the subsystem doc for your area (e.g. [frontend.md](./frontend.md)).
4. Check [decisions.md](./decisions.md) for existing ADRs — do not contradict without a new ADR.
5. For schema changes, read [database.md](./database.md) and add SQL migration files.

---

## Branch strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production-ready; protected |
| `feature/<short-description>` | New work |
| `fix/<short-description>` | Bug fixes |

**SHOULD:** Keep PRs small and focused (< 400 lines when possible).

---

## Pull request checklist

- [ ] Lint passes (`npm run lint`)
- [ ] Build passes (`npm run build`)
- [ ] RLS policies updated if schema/permissions changed
- [ ] Docs updated if behavior or architecture changed
- [ ] No secrets in diff
- [ ] Privacy rules respected (`resumes.name` not exposed on Discover)
- [ ] ADR added if architectural decision made

---

## Database changes

1. Add SQL file to repo (target: `db/migrations/`)
2. Document in [database.md](./database.md)
3. Run on staging before production
4. Include RLS policies when enabling RLS on new tables

**Never** enable RLS without policies — see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md).

---

## Documentation changes

| Change type | Update |
|-------------|--------|
| New API endpoint | [api.md](./api.md) |
| New table | [database.md](./database.md) |
| Architecture shift | [architecture.md](./architecture.md) + ADR |
| Security / RLS | [security.md](./security.md) |

---

## AI assistant instructions

When using Cursor, Claude Code, or Copilot:

1. **Read** `docs/architecture.md` and `docs/decisions.md` first.
2. **Do not** introduce a new stack (e.g. Redux, Prisma) without ADR.
3. **Match** existing patterns in prototype (CSS variables, component structure) until Next.js migration.
4. **Never** put service role keys in client code.
5. **Prefer** extending existing components over new abstractions.

---

## Local development

```bash
# Install
npm install

# Env (create .env.local)
VITE_SUPABASE_URL=...
VITE_SUPABASE_KEY=...   # anon key only

# Run
npm run dev
```

See [deployment.md](./deployment.md) for OAuth localhost setup.

---

## Code review expectations

Reviewers SHOULD verify:

- Security (RLS, auth, private fields)
- UX consistency (Toast not alert, ConfirmationModal not confirm)
- Scalability (no O(n) full table fetch without pagination plan)
- Docs if needed

---

## Common mistakes

| Mistake | Prevention |
|---------|------------|
| Skipping RLS policies | Checklist + SQL review |
| Large unrelated PRs | Split by subsystem |
| Undocumented breaking API change | Update api.md |

---

## Related documents

- [coding-standards.md](./coding-standards.md)
- [testing.md](./testing.md)
- [security.md](./security.md)
