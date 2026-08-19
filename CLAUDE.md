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
│   ├── shared-types/    # Common TS types & DTOs (zod schemas + class-validator)
│   ├── eslint-config/   # Shared ESLint flat config (future)
│   └── tsconfig/        # Shared TypeScript configs (future)
```

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
- `@prisma/client` — type-safe DB access
- `prisma` — CLI & migrations
- `@nestjs/axios` — HTTP client

### Frontend (apps/web)
- **Framework**: Vite + React 19 + TypeScript
- **Routing**: react-router-dom v7
- **State & data**:
  - Server state: `@tanstack/react-query` v5 (TanStack Query)
  - Client state: `zustand` (only auth/UI flags, no data)
- **Forms**: `react-hook-form` + `zod` (schema validation)
- **Styling**: Tailwind CSS v4 + PostCSS
- **UI Components**: shadcn/ui (optional, placeholder for component library)
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
- No `.env` for dev (Vite proxies API on :4000 via vite.config.ts, future)
- Environment variables for build-time config (e.g., `VITE_API_URL`) go in `apps/web/.env`

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
- `pnpm --filter web test` — Run Vitest unit tests
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

This project is structured to progressively introduce Claude Code features:

### Stage 1: Initialization (current)
- **Topics**: plan mode, CLAUDE.md / project rules, git initialization
- **Tools**: Bash, git, file creation (no agents yet)
- **Outcome**: Working monorepo skeleton, postgres running, both dev servers start

### Stage 2: Backend Core
- **Topics**: custom slash-commands (e.g., `/gen-nest-crud`), skills, MCP servers (PostgreSQL)
- **Implement**: Links CRUD endpoints, redirect tracking
- **Outcome**: Fully functional `/api/links` and `/:code` redirects

### Stage 3: Frontend
- **Topics**: different subagent types (Explore, Plan, custom), MCP claude-in-chrome (visual testing)
- **Implement**: Dashboard, link list, create link form
- **Outcome**: Clickable UI with API integration

### Stage 4: Authentication
- **Topics**: hooks (lint/test on pre-commit), custom security-focused subagents
- **Implement**: Google OAuth flow, JWT middleware, per-user link isolation
- **Outcome**: Multi-user support, auth guards on endpoints

### Stage 5: Analytics
- **Topics**: agent teams (backend aggregation + frontend charts coordinated), dynamic workflows
- **Implement**: Click aggregation queries, UA parsing, dashboard charts
- **Outcome**: Rich analytics views per link

### Stage 6: Testing & QA
- **Topics**: dynamic workflows (multi-file test generation), agent view (monitor parallel test runs), `/loop` (iterate fixes)
- **Implement**: Comprehensive unit & component tests, E2E tests (Playwright)
- **Outcome**: >80% code coverage, all CI checks passing

### Stage 7: CI/CD
- **Topics**: GitHub Actions, MCP GitHub, scheduled/cron agents
- **Implement**: GitHub Actions workflows (lint, test, build, deploy)
- **Outcome**: Automated validation on push

### Stage 8: Polish
- **Topics**: Artifacts for documentation, status-line customization
- **Implement**: README updates, API docs, deployment guide
- **Outcome**: Production-ready, documentedcode

## Debugging & Troubleshooting

### pnpm issues
- **"Ignored build scripts"**: Prisma requires approval to run build scripts. Use `pnpm approve-builds` or ignore (warning only).
- **Lockfile conflicts**: `pnpm install` should auto-resolve.

### Prisma / Database
- **"column does not exist"**: Run `pnpm --filter api exec prisma migrate dev` to apply pending migrations.
- **Reset database**: `pnpm --filter api exec prisma migrate reset` (destructive — dev only).

### Frontend build
- **Module not found errors**: Ensure `workspace:*` protocol resolves correctly for `@link-shortener/shared-types`.
- **Tailwind not styling**: Check `apps/web/src/index.css` has `@import "tailwindcss"`.

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

**Stage 1 (Initialization)**: ✅ In progress
- [x] Git repo initialized
- [x] Monorepo structure (pnpm + Turborepo)
- [x] Backend scaffold (NestJS + Prisma)
- [x] Frontend scaffold (Vite + React)
- [x] Docker setup (PostgreSQL)
- [x] CLAUDE.md & docs/plan.md
- [ ] Verify all dev servers start
- [ ] First git commit

**Stages 2–8**: Roadmap in `docs/plan.md`

---

_Updated: 2026-08-20_  
_Maintainer: Claude Code learning project_
