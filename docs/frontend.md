# Frontend

## Purpose

Defines client architecture for Kazana web and mobile applications: structure, state, routing, and integration with backend services.

---

## Client applications

| App | Stack | Status | Deployment |
|-----|-------|--------|------------|
| **Web** | Next.js (App Router) | **Current repo** | Vercel |
| **Web prototype** | Vite + React + React Router | Archived (`_legacy/vite-src`) | — |
| **Mobile** | React Native (Expo) | Planned | EAS Build → App Store / Play |

---

## Architectural diagram (target)

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION                         │
│  Pages / Screens  •  Components  •  Design tokens     │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│                    APPLICATION                          │
│  Hooks  •  Auth context  •  Form validation  •  Toasts  │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│                    DATA ACCESS                          │
│  API client (fetch)  •  Supabase client (auth/storage)    │
└─────────────────────────────────────────────────────────┘
```

---

## Web (Next.js — target)

### Routing

| Route | Product | Auth |
|-------|---------|------|
| `/` | Marketing / home | Public |
| `/discover` | Resume Vault | Public |
| `/login` | Auth | Public |
| `/add-resume` | Resume Vault | Required |
| `/resume-manager` | Resume Vault | Required |
| `/edit-resume/[id]` | Resume Vault | Required (owner) |
| `/jobs` (future) | Job Discovery | Public / auth |
| `/settings` (future) | Profile + notifications | Required |

### Rendering strategy

| Page type | Strategy | Why |
|-----------|----------|-----|
| Marketing, Discover list | SSR or SSG + client filters | SEO, fast first paint |
| Authenticated forms | CSR with server actions optional | Rich interactivity |
| Job detail (future) | SSR | Shareable links |

### WHY Next.js over Vite SPA (production)

| Factor | Next.js | Vite SPA (rejected for prod) |
|--------|---------|------------------------------|
| SEO for Discover | SSR capable | Poor default |
| API colocation | API routes in repo | Separate backend required |
| Auth cookie handling | Server-side session options | Client-only |
| Scale pattern | Industry standard for React web | Fine for prototypes |

---

## Web prototype (current repo)

**Stack:** Vite 7, React 19, React Router 7, inline styles + CSS variables.

**Key pages:**

- `Discover.jsx` — filters, sort, pagination, PDF modal
- `AddResume.jsx` / `EditResume.jsx` — forms with react-select
- `ResumeManager.jsx` — CRUD table
- `Login.jsx` — email + Google OAuth

**Shared components:** Button, Card, Input, Toast, ConfirmationModal, PDFModal, Breadcrumbs, etc.

**Design system:** CSS variables in `index.css` (`--color-primary`, `--spacing-*`, etc.)

### Prototype → Next.js migration notes

1. Move pages to `app/` directory structure
2. Replace React Router with Next.js file-based routing
3. Extract Supabase calls to server actions or API routes where secrets/validation needed
4. Port CSS variables to global styles or Tailwind theme tokens (decision TBD)

---

## Mobile (Expo — planned)

### Structure (recommended)

```
apps/mobile/
├── app/                 # Expo Router screens
├── components/
├── hooks/
├── services/            # API + Supabase (shared patterns with web)
└── constants/
```

### Shared logic with web

| Share via | Examples |
|-----------|----------|
| Monorepo package `@kazana/types` | Job family enums, API types |
| Monorepo package `@kazana/validation` | Zod schemas for resume form |
| API contracts in [api.md](./api.md) | Identical request/response shapes |

### WHY Expo

- Single codebase iOS + Android
- EAS for CI builds
- Push notification plugins (FCM)
- Rejected: React Native CLI bare — slower iteration for small team

---

## State management

| State type | Approach | Why |
|------------|----------|-----|
| Auth user | React Context (`AuthContext`) | Simple, Supabase-driven |
| Server data (lists) | `useEffect` + fetch / React Query (target) | Caching, stale-while-revalidate |
| Form state | Local `useState` | No global form store needed |
| UI (modals, toasts) | Local state + hooks | Keeps components portable |

**Future:** TanStack Query for Discover/resume lists at scale.

---

## Communication with other subsystems

| Subsystem | Integration |
|-----------|-------------|
| [api.md](./api.md) | HTTP JSON for mutations and complex queries |
| Supabase Auth | `supabase.auth` — OAuth, session |
| Supabase Storage | PDF upload/download URLs |
| [notifications.md](./notifications.md) | Expo push tokens registered via API |

---

## Design principles

1. **Component library consistency** — reuse Button, Input, Card patterns
2. **Accessible by default** — skip link, ARIA on tables/pagination, focus traps in modals
3. **Mobile-first responsive** — card layouts below breakpoints for tables
4. **No business logic in presentational components**

---

## Assumptions

- Web primary surface for Resume Vault v1; mobile follows Job Discovery push use case
- PDF viewing via iframe/modal on web; native PDF viewer on mobile

---

## Future expansion

- Tailwind or Circuit-style design system package
- Storybook for component documentation
- Deep linking (`kazana://job/:id`)

---

## Known limitations (prototype)

- Inline styles — harder to theme than Tailwind/CSS modules
- Client-side only data fetching — no SSR
- No shared package monorepo yet

---

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Duplicating job family labels | Use `getJobFamilyByValue()` helper |
| Searching private `name` on Discover | Exclude from search fields |
| `alert()` for user feedback | Use Toast component |

---

## Related documents

- [architecture.md](./architecture.md)
- [api.md](./api.md)
- [coding-standards.md](./coding-standards.md)
