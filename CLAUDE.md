# CLAUDE.md: link-shortener-with-analytics

**Purpose**: Educational monorepo project for learning Claude Code capabilities through building a link shortening service with analytics.

## Tech Stack & Architecture

### Monorepo Structure
- **Package manager**: pnpm (corepack-managed)
- **Monorepo tool**: Turborepo
- **Workspace**: `pnpm-workspace.yaml` defines `apps/*` and `packages/*`

```
link-shortener/
├── apps/
│   ├── api/       # NestJS backend, TypeScript strict mode
│   └── web/       # Vite + React frontend, TypeScript strict mode
├── packages/
│   └── shared-types/    # Common TS types & DTOs (zod schemas + class-validator)
```

`packages/eslint-config` and `packages/tsconfig` (shared configs across workspaces) are a possible future addition, not created yet — each app currently has its own lint/tsconfig setup.

### Backend (apps/api)
- **Framework**: NestJS (latest)
- **ORM**: Prisma (PostgreSQL)
- **Database**: PostgreSQL 16 (in docker-compose)
- **Schema**: `apps/api/prisma/schema.prisma` — single source of truth for data models
- **Modules**: `prisma` (global), `health`, `auth` (placeholder), `users`, `links`, `redirect`, `analytics`
- **Port**: 4000 (via `process.env.PORT ?? 4000`)
- **CORS**: Enabled for `http://localhost:5173` and `http://localhost:3000`

Key dependencies:
- `@nestjs/config` — environment management
- `@nestjs/terminus` — health checks
- `@prisma/client` / `prisma` — **pinned to v6** (`^6.0.0`), not v7. v7 moved `datasource.url` out of `schema.prisma` into a separate `prisma.config.ts` and broke `prisma migrate dev` without it — not worth the complexity for this project. Do not upgrade without a deliberate reason.
- `class-validator` / `class-transformer` — required peer deps for Nest's `ValidationPipe` (used in `main.ts`); not installed by the Nest CLI scaffold by default, must be added explicitly.
- `@nestjs/axios` — HTTP client

### Frontend (apps/web)
- **Framework**: Vite + React 19 + TypeScript
- **Routing**: react-router-dom v7
- **State & data**:
  - Server state: `@tanstack/react-query` v5 (TanStack Query)
  - Client state: `zustand` (only auth/UI flags, no data)
- **Forms**: `react-hook-form` + `zod` (schema validation)
- **Styling**: Tailwind CSS v4 + PostCSS
- **UI Components**: shadcn/ui (Radix UI base, "Nova" preset — set up in Stage 3 via `pnpm dlx shadcn@latest init -b radix -p nova`)
- **Charts**: `recharts` (analytics visualization)
- **Port**: 5173 (Vite dev-server default)
- **Testing**: Vitest + React Testing Library

Key dependencies:
- `react-router-dom` — client routing
- `@tanstack/react-query` — server state & caching
- `react-hook-form` + `zod` — form validation (same zod as backend DTOs)
- `zustand` — lightweight global state
- `tailwindcss` + `postcss` + `autoprefixer` — styling
- `recharts` — charts for analytics dashboard
- `vitest` + `@testing-library/react` — unit & component testing

### Docker
- **docker-compose.yml**: PostgreSQL 16 (alpine) only
- **Volumes**: Named volume `pgdata` for data persistence
- **Health check**: `pg_isready` with 5s intervals
- No containers for backend/frontend in dev — they run natively via `pnpm dev` to preserve HMR

## Development Workflow

### Initial Setup
```bash
# Activate pnpm via corepack
corepack enable && corepack prepare pnpm@latest --activate

# Install all dependencies (root workspace + all apps/packages)
pnpm install

# Start PostgreSQL container
pnpm docker:up
# or: docker compose up -d postgres

# Initialize database schema & run Prisma migrations
pnpm --filter api exec prisma migrate dev --name init
```

### Running Dev Servers
```bash
# Terminal 1: Start both frontend (Vite :5173) and backend (Nest :4000) in parallel
pnpm dev

# Terminal 2 (optional): Watch database with Prisma Studio
pnpm --filter api exec prisma studio
```

### Building for Production
```bash
# Build all apps and packages
pnpm build

# Lint all apps and packages
pnpm lint
```

### Database

#### Migrations
```bash
# Create a new migration after schema.prisma changes
pnpm --filter api exec prisma migrate dev --name <migration_name>

# Apply existing migrations (CI/deploy)
pnpm --filter api exec prisma migrate deploy

# View database in web UI
pnpm --filter api exec prisma studio
```

#### Schema
- Location: `apps/api/prisma/schema.prisma`
- Models: User, Link, Click (with Click.DeviceType enum)
- Each entity in the schema is the single source of truth for:
  - Prisma Client types (FE/BE both use `@prisma/client` or `@link-shortener/shared-types`)
  - Database migrations
  - Future ORM-agnostic type exports to shared-types

### Environment Variables

#### Root `.env` (docker-compose credentials, .gitignored)
```
POSTGRES_USER=linkshortener
POSTGRES_PASSWORD=linkshortener
POSTGRES_DB=linkshortener
```

#### Backend `apps/api/.env` (database connection + app config, .gitignored)
```
DATABASE_URL="postgresql://linkshortener:linkshortener@localhost:5432/linkshortener"
PORT=4000
```

#### Frontend
- No `.env` needed for dev — `vite.config.ts` proxies `/api/*` requests to `http://localhost:4000` (prefix stripped before forwarding), so the browser only ever talks to `:5173`.
- Environment variables for build-time config (e.g., `VITE_API_URL`) go in `apps/web/.env` if/when needed.

### Scripts (pnpm commands)

**Root workspace** (`pnpm` = run in all apps/packages):
- `pnpm dev` — Run all `dev` scripts in parallel (persistent, no cache)
- `pnpm build` — Build all apps/packages with dependency awareness (Turborepo)
- `pnpm lint` — Lint all apps/packages
- `pnpm type-check` — Run TypeScript type checking all apps
- `pnpm test` — Run all tests
- `pnpm docker:up` — Start PostgreSQL container
- `pnpm docker:down` — Stop and remove PostgreSQL container
- `pnpm docker:logs` — Tail PostgreSQL logs

**Backend** (`pnpm --filter api`):
- `pnpm --filter api dev` — Start Nest dev server with HMR (:4000)
- `pnpm --filter api build` — Build Nest (tsc + swc)
- `pnpm --filter api exec prisma migrate dev --name <name>` — Create + apply migration
- `pnpm --filter api exec prisma studio` — Open Prisma Studio

**Frontend** (`pnpm --filter web`):
- `pnpm --filter web dev` — Start Vite dev server (:5173)
- `pnpm --filter web build` — Build Vite bundle (dist/)
- `pnpm --filter web test` — Run Vitest unit tests (**not installed yet** — Vitest/RTL setup happens in Stage 6, `docs/stage-6-testing-qa.md`; no `test` script exists in `apps/web/package.json` until then)
- `pnpm --filter web lint` — Lint (oxlint by default)

## Code Conventions & Patterns

### TypeScript
- **Strict mode**: enabled in all apps and packages (`"strict": true` in tsconfig.json)
- **No `any`**: use unknown + type guards or proper types
- **Decorators**: NestJS uses decorators extensively (`@Module`, `@Service`, `@Controller`, etc.)

### File Organization

**Backend** (apps/api/src/):
```
auth/             # JWT & Google OAuth strategy, guards, decorators
users/            # User CRUD, profile
links/            # Link CRUD (create, read, update, delete)
redirect/         # Public GET /:code endpoint, click tracking
analytics/        # Click aggregation, analytics endpoints
prisma/           # Global PrismaService & PrismaModule
health/           # GET /health (readiness check)
common/           # Shared filters, interceptors, pipes
```

**Frontend** (apps/web/src/):
```
routes/           # Page components (Dashboard, LinkAnalytics, Login, NotFound)
components/ui/   # shadcn/ui & other reusable components (buttons, cards, dialogs, charts)
features/         # Feature-level logic (links, analytics, auth)
  ├── links/      # useLinks hook, CreateLinkForm, LinksList
  ├── analytics/  # Chart components, useAnalytics hook
  └── auth/       # useCurrentUser, AuthGuard, LoginPage
lib/              # Utilities (api-client, query-client, helpers)
stores/           # Zustand stores (auth.store.ts only, no data stores)
```

**Shared types** (packages/shared-types/src/):
```
index.ts          # All exported types: Link, Click, User, CreateLinkRequest, LinkAnalytics, etc.
                  # No implementation, only type definitions
```

### Patterns & Reuse

1. **DTOs & Validation**:
   - Define Zod schemas in `packages/shared-types` (import into both BE and FE)
   - Backend uses `class-validator` + Nest `ValidationPipe` for request validation
   - Frontend uses Zod directly in `react-hook-form`
   - Same schema = same validation logic everywhere

2. **API Communication**:
   - Thin `apps/web/src/lib/api-client.ts` wrapper around `fetch` with error handling
   - TanStack Query hooks for server state (`useQuery`, `useMutation`)
   - Response types come from `@link-shortener/shared-types`

3. **Global State**:
   - Auth state only (logged-in user, token) → `zustand` store
   - All other state → TanStack Query (server-driven)
   - No Redux, no Context overload

4. **Forms**:
   - `react-hook-form` (lightweight, performant)
   - `zod` for schema validation (same as backend)
   - Auto-generated error messages

### Testing

- **Backend**: Jest (default with Nest, already in generated package.json)
  - `apps/api/src/**/*.spec.ts`
  - Run: `pnpm --filter api test`

- **Frontend**: Vitest + React Testing Library
  - `apps/web/src/**/*.test.tsx`
  - Run: `pnpm --filter web test`
  - Coverage: `pnpm --filter web test -- --coverage`

## Claude Code Learning Path

This project is a learning vehicle for Claude Code features, structured as 8 stages (initialization → backend → frontend → auth → analytics → testing → CI/CD → polish). Full roadmap, per-stage topics, detailed implementation plans and current status live in **`docs/plan.md`** (overview + status table) and **`docs/stage-N-*.md`** (one detailed file per stage) — read those instead of duplicating them here.

## Debugging & Troubleshooting

### pnpm issues
- **"Ignored build scripts"**: Prisma requires approval to run build scripts. Use `pnpm approve-builds` or ignore (warning only).
- **Lockfile conflicts**: `pnpm install` should auto-resolve.

### Prisma / Database
- **"column does not exist"**: Run `pnpm --filter api exec prisma migrate dev` to apply pending migrations.
- **Reset database**: `pnpm --filter api exec prisma migrate reset` (destructive — dev only).
- **`prisma migrate dev` fails with a `datasource.url`/`prisma.config.ts` error**: you're on Prisma v7 by accident. This project pins v6 — check `apps/api/package.json`.

### Backend won't start: "The class-validator package is missing"
- `ValidationPipe` in `main.ts` needs `class-validator` + `class-transformer` as peer deps. Nest CLI doesn't install them by default: `pnpm --filter api add class-validator class-transformer`.

### Frontend build
- **Module not found errors**: Ensure `workspace:*` protocol resolves correctly for `@link-shortener/shared-types`.
- **Tailwind not styling**: Check `apps/web/src/index.css` has `@import "tailwindcss"`.
- **`shadcn add` writes files into a literal `./@/` directory instead of `src/`**: the CLI reads the `@/` path alias from `apps/web/tsconfig.json` directly and does not follow TS project `references` into `tsconfig.app.json`. The alias must be declared in **both** `tsconfig.json` and `tsconfig.app.json` (`baseUrl: "."`, `paths: {"@/*": ["./src/*"]}`) — not just `vite.config.ts`'s `resolve.alias`, which only satisfies the bundler, not `tsc` or CLI tooling that reads tsconfig directly.
- **`erasableSyntaxOnly` (in `tsconfig.app.json`) rejects constructor parameter properties**: `constructor(public readonly x: T)` generates runtime assignment code, which this flag disallows. Declare fields explicitly and assign them in the constructor body instead.

### API connection
- **CORS errors**: Verify CORS is enabled in `apps/api/src/main.ts` for `http://localhost:5173`.
- **Connection refused**: Check backend is running on port 4000: `curl http://localhost:4000/health`.

## Links & References

- [Prisma Docs](https://www.prisma.io/docs/)
- [NestJS Docs](https://docs.nestjs.com/)
- [React Router v7](https://reactrouter.com/)
- [TanStack Query](https://tanstack.com/query/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Turborepo](https://turbo.build/repo/docs)
- [pnpm](https://pnpm.io/)

## Project Status

**Stage 1 (Initialization)**: ✅ Done — monorepo skeleton, both dev servers verified working, `GET /health` returns `200` with DB status, first commits pushed.

**Stage 2 (Backend Core)**: ✅ Done — `/links` CRUD, public `GET /:code` redirect with fire-and-forget click tracking, `analytics.recordClick()` stub. `PrismaService` rewritten to properly `extends PrismaClient` (was an untyped v6/v7-compat hack from Stage 1). `nanoid` pinned to `^3.3.8` (v4+ is ESM-only, breaks this project's CommonJS backend build — same class of issue as the Prisma v7 rollback). See `docs/stage-2-backend-core.md` for full details.

**Stage 3 (Frontend)**: ✅ Done — Dashboard with create-link form (react-hook-form + zod, shared validation schema now lives in `packages/shared-types`), links list (soft-delete aware, copy-to-clipboard), `react-router-dom` v7 routing, shadcn/ui (Radix base). `Link` type in `shared-types` fixed to match Prisma's actual nullable-field JSON shape rather than an independently-guessed optional-field shape. See `docs/stage-3-frontend.md` for full details.

**Stages 4–8**: Not started. Full roadmap, detailed per-stage plans and live status table in `docs/plan.md`.

**Documentation sync policy**: after every stage's `/stage-review N` comes back clean, ALL affected documentation (this file, `docs/plan.md`, the stage's own `docs/stage-N-*.md`, `README.md` if setup changed) is synchronized to match the actual implementation before the stage is considered done — not just the status line. See "Обязательное обновление документации после этапа" in `docs/plan.md`.

---

_Updated: 2026-08-21_  
_Maintainer: Claude Code learning project_
