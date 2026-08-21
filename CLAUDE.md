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
- **Modules**: `prisma` (global), `health`, `auth` (Google OAuth + JWT, Stage 4), `users`, `links`, `redirect`, `analytics`
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
  └── auth/       # LoginPage, AuthCallback, AuthGuard
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
  - Run: `pnpm --filter api test` · Coverage: `pnpm --filter api test:cov` (80% threshold on all 4 metrics, set in `apps/api/package.json`'s `jest.coverageThreshold` — excludes `*.module.ts`/`main.ts`/`dto/*.ts`)

- **Frontend**: Vitest + React Testing Library (installed Stage 6 — was documented since Stage 1 but never actually set up until then)
  - `apps/web/src/**/*.test.tsx`
  - Run: `pnpm --filter web test` · Coverage: `pnpm --filter web test:cov` (80% threshold, `apps/web/vitest.config.ts`)
  - Setup file: `apps/web/src/test/setup.ts` (jest-dom matchers + explicit RTL `cleanup()` registration — `vitest.config.ts` sets `globals: false`, so RTL's auto-cleanup never self-registers)

- **E2E**: Playwright, separate workspace `apps/e2e/` (not `apps/web/e2e/` — kept fully isolated from Vitest config)
  - `apps/e2e/tests/*.spec.ts`
  - Run: `pnpm --filter e2e test:e2e` (needs `pnpm dev` + `docker compose up -d postgres` running first)
  - `apps/e2e/tests/auth-helper.ts` logs in by minting a real JWT (same `JWT_SECRET` the backend verifies) and seeding a matching `User` row via `psql` — no real Google OAuth flow is driven (not available in this environment), but every other line of app code (AuthCallback, `/auth/me`, guards) runs for real
  - Browser install: `npx playwright install chromium` (no `--with-deps` — needs `sudo`/`apt` for system libs not available in every environment; the browser runs fine without them anyway)

## Claude Code Learning Path

This project is a learning vehicle for Claude Code features, structured as 8 stages (initialization → backend → frontend → auth → analytics → testing → CI/CD → polish). Full roadmap, per-stage topics, detailed implementation plans and current status live in **`docs/plan.md`** (overview + status table) and **`docs/stage-N-*.md`** (one detailed file per stage) — read those instead of duplicating them here.

## Debugging & Troubleshooting

### pnpm issues
- **"Ignored build scripts"**: locally this is only a warning (safe to ignore), but `pnpm install --frozen-lockfile` on a fresh CI runner treats it as a **hard error** (exit 1) — confirmed by Stage 7's first real GitHub Actions run. The fix is `allowBuilds: {packageName: true, ...}` in `pnpm-workspace.yaml` (pnpm 11's real mechanism — not `onlyBuiltDependencies`, that's the pnpm ≤10 name and pnpm 11 silently ignores it with no error). If you ever see pnpm auto-inject a broken `allowBuilds:` block with literal `"set this to true or false"` placeholder strings into that file, that's pnpm itself trying to prompt without a TTY — replace the placeholders with real `true`/`false`, don't just delete the block.
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

### Auth (Stage 4)
- **Backend crashes on startup with "JWT_SECRET is not set"**: intentional (`apps/api/src/auth/jwt-secret.ts`) — the app refuses to start rather than silently signing/verifying tokens with a fallback value. Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and put it in `apps/api/.env`.
- **"Sign in with Google" shows a Google error page instead of the consent screen**: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` aren't set to real values yet — see "Как получить Google OAuth credentials" in `docs/stage-4-authentication.md`. The rest of the app works fine without them.
- **`uvx`/`pip` not available**: this environment has no Python package-manager tooling, so `semgrep-mcp` (originally planned as an MCP server) can't be installed via `uvx`. Use the official Docker image directly instead: `docker run --rm -v "$(pwd):/src" semgrep/semgrep semgrep scan --config=auto /src/apps/api/src /src/apps/web/src` — this is what `.claude/agents/security-reviewer.md` does.

### Testing / E2E (Stage 6)
- **`psql -v var=value -c "... :'var' ..."` errors with a syntax error at `:`**: `psql`'s `:'var'` variable substitution only runs on SQL read via stdin/script/interactive input, NOT on the `-c` argument itself (confirmed directly against psql 16.15 — identical query piped via stdin works fine). Use `execFileSync('psql', [...], { input: sql })` instead of `-c`, see `apps/e2e/tests/auth-helper.ts`.
- **E2E fails in CI with "No such container: link-shortener-db" but passes locally**: `auth-helper.ts` originally ran `psql` via `docker exec` into the local dev machine's docker-compose container by name — that container doesn't exist in GitHub Actions (the `services:` Postgres container has a different, internal name). Fixed (Stage 7) by running `psql` via `docker run --network host postgres:16-alpine` connecting to `localhost:5432` directly — works identically local/CI without depending on a container name or a host-installed `psql` binary.
- **`web:type-check` fails only in CI/a fresh clone with "Cannot find module '@link-shortener/shared-types'"**: `turbo.json`'s `type-check` task needs `dependsOn: ["^build"]` (like `dev`/`build`/`test:e2e` already have) — `web` resolves that workspace package against its built `dist/`, not `src/`. Stays invisible locally once `dist/` exists from any earlier `pnpm dev`/`build` run; a genuinely fresh checkout has none.
- **`playwright install --with-deps` fails ("sudo: a password is required")**: no root access in this environment. Run `npx playwright install chromium` without the flag — downloads just the browser binary, which runs fine without the system libs `--with-deps` would otherwise apt-install.
- **`pnpm --filter web test` errors "no such script"**: make sure you're not on an old checkout from before Stage 6 — `apps/web/package.json` didn't have a `test` script until then despite `CLAUDE.md`/`docs/plan.md` referencing Vitest since Stage 1.

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

**Stage 4 (Authentication)**: ✅ Done — Google OAuth + JWT, every `/links` endpoint scoped to the authenticated user, `JwtAuthGuard` + `@CurrentUser()`. Real Google Cloud credentials are the one piece Claude Code can't set up (requires the user's own Google account) — see "Как получить Google OAuth credentials" in `docs/stage-4-authentication.md`; everything else is implemented and verified. App now refuses to start without a real `JWT_SECRET` (`auth/jwt-secret.ts`). `.claude/settings.json` adds a pre-commit `PreToolUse` hook (lint+test gate on `git commit`). See `docs/stage-4-authentication.md` for full details.

**Stage 5 (Analytics)**: ✅ Done — `GET /links/:id/analytics` (owner-scoped), `ua-parser-js`-based UA parsing on every click, 30-day zero-filled click chart, top-5 referrers, device breakdown pie chart. Built via two parallel `Agent`-tool dispatches against the already-fixed `LinkAnalytics` shared-types contract (substituting for the plan's "Agent teams" topic, which needs explicit enablement not attempted during an unsupervised overnight run). See `docs/stage-5-analytics.md` for full details.

**Stage 6 (Testing/QA)**: ✅ Done — 63 backend Jest tests + 37 frontend Vitest tests + 2 Playwright E2E scenarios, all green. Coverage 80%+ on all four metrics in both `api` and `web` (`test:cov` scripts). Most unit tests generated via a new Dynamic Workflow (`.claude/workflows/generate-tests.js`) with independent peer verification per file. New `apps/e2e` workspace. Full-codebase Semgrep sweep tightened `CreateLinkDto`'s URL protocol allowlist (http/https only). See `docs/stage-6-testing-qa.md` for full details.

**Stage 7 (CI/CD)**: ✅ Done — repo published to GitHub (`github.com/AlexGitHubAccount/link-shortener-with-analytics`, private, personal account, not the work account — see `docs/stage-7-cicd.md` for why) after explicit user confirmation, via the official local `ghcr.io/github/github-mcp-server` Docker image (OAuth, no manual token). `.github/workflows/{ci,e2e}.yml` verified green on real GitHub Actions runs — 6 CI-only failures found and fixed along the way (pnpm 11 build-script approval, a type-aware-eslint false positive, a hardcoded local container name in `auth-helper.ts`, and turbo's `type-check`/`test`/`test:cov` tasks all missing `dependsOn: ["^build"]`), none of them catchable without a real cloud run — see `docs/stage-7-cicd.md` for the full list. `/stage-review 7` clean, tagged `stage-7-done`. Remaining manual-only step: branch protection in the GitHub UI (documented in `docs/stage-7-cicd.md`, GitHub MCP has no tool for repo settings).

**Stage 8 (Polish)**: ✅ Done — Swagger/OpenAPI docs at `GET /api/docs` (all 8 real routes annotated and verified in the generated document), a recorded GIF of the core user flow (`docs/assets/link-shortener-demo.gif`, embedded in README), a published final Artifact report, and a full pass over every `docs/stage-*.md` confirming no stale `⏳ Запланирован` statuses remain. Also removed `apps/api/src/app.{controller,service}.ts` — unused Nest CLI scaffold from Stage 1, never registered in `AppModule`, would have shown up as a stray endpoint in the new Swagger UI. See `docs/stage-8-polish.md` for full details.

**Documentation sync policy**: after every stage's `/stage-review N` comes back clean, ALL affected documentation (this file, `docs/plan.md`, the stage's own `docs/stage-N-*.md`, `README.md` if setup changed) is synchronized to match the actual implementation before the stage is considered done — not just the status line. See "Обязательное обновление документации после этапа" in `docs/plan.md`.

---

_Updated: 2026-08-21_  
_Maintainer: Claude Code learning project_
