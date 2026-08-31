# Coding Standards

## Purpose

Conventions for readable, maintainable Kazana code across web, mobile, and API (current prototype + target stack).

---

## Languages and tooling

| Area | Standard |
|------|----------|
| Web (current) | JavaScript/JSX, Vite, ESLint |
| Web (target) | TypeScript, Next.js App Router, ESLint |
| Mobile (target) | TypeScript, Expo, Expo Router |
| API (target) | TypeScript, Zod validation |
| SQL | PostgreSQL, lowercase snake_case |

**Direction:** Migrate prototype JS → TS during Next.js migration.

---

## File and folder conventions

### Current prototype (`src/`)

```
src/
├── components/     # Reusable UI (Button, Card, PDFModal)
├── pages/          # Route-level screens
├── context/        # React context (Auth)
├── hooks/          # Custom hooks (useToast)
├── constants/      # Static data (jobFamilies)
└── supabaseClient.js
```

### Target monorepo (recommended)

```
apps/
  web/          # Next.js
  mobile/       # Expo
packages/
  types/        # Shared TypeScript types
  validation/   # Zod schemas
```

---

## Naming

| Item | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ConfirmationModal.jsx` |
| Hooks | camelCase, `use` prefix | `useToast` |
| Constants | SCREAMING_SNAKE or grouped export | `JOB_FAMILY_GROUPS` |
| DB columns | snake_case | `years_of_experience` |
| API routes | kebab-case path | `/api/resumes/mine` |
| CSS variables | kebab-case | `--color-primary` |

---

## React patterns

1. **Functional components only** — no class components
2. **Colocate state** — lift only when shared
3. **Extract components** when JSX block > ~50 lines or reused twice
4. **useEffect** for data fetch — migrate to TanStack Query in production
5. **No inline business rules in JSX** — extract to functions or services

### Forms

- Use shared `Input`, `Button` components
- Inline validation with error state (see AddResume pattern)
- Required fields marked with red asterisk
- Toast for success; `Alert` for errors; `ConfirmationModal` for destructive actions
- **Never** `window.alert()` or `window.confirm()`

---

## Styling (prototype)

- CSS variables from `index.css` — do not hardcode hex colors in components
- Inline styles acceptable in prototype; target migration to Tailwind or CSS modules
- Responsive: `isMobile` breakpoint pattern or CSS media queries
- Accessibility: focus-visible, ARIA on tables/pagination, modal focus trap

---

## Supabase usage

```javascript
// GOOD: user-scoped with RLS
const { data, error } = await supabase
  .from('resumes')
  .select('*')
  .eq('user_id', user.id);

// BAD: service role in browser
// NEVER import service role key client-side
```

---

## API route patterns (target)

```typescript
// Pseudocode — illustrative only
export async function POST(req: Request) {
  const user = await requireAuth(req);
  const body = CreateResumeSchema.parse(await req.json());
  const resume = await resumeService.create(user.id, body);
  return Response.json({ data: toPublicResume(resume) });
}
```

---

## Error handling

| Layer | Pattern |
|-------|---------|
| UI | User-friendly message + log to console/Sentry |
| API | Structured error JSON (see [api.md](./api.md)) |
| Workers | Retry with backoff; dead letter after N failures |

---

## Comments

- Comment **why**, not what
- No commented-out dead code in merged PRs
- ADRs for architectural **why** → [decisions.md](./decisions.md)

---

## Git commits

- Imperative mood: "Add pagination to Discover"
- Reference issue/ADR when applicable
- One logical change per commit when possible

---

## Common mistakes

| Mistake | Standard |
|---------|----------|
| Duplicating job family labels | `getJobFamilyByValue()` |
| Primary button for every action | Outline for secondary (see Login, forms) |
| Fetching all resumes without pagination plan | Client pagination OK for prototype; API cursors for prod |

---

## Related documents

- [contributing.md](./contributing.md)
- [frontend.md](./frontend.md)
- [testing.md](./testing.md)
