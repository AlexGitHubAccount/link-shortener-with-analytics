# Link Shortener with Analytics

Educational monorepo project for learning Claude Code: link shortener generator with detailed analytics (click tracking, referrer analysis, User-Agent parsing).

## Project Structure

```
link-shortener/
├── apps/
│   ├── api/       # NestJS backend
│   └── web/       # Vite + React frontend
├── packages/
│   └── shared-types/   # Common TS types & DTOs
├── docker-compose.yml  # PostgreSQL for local dev
└── docs/
    ├── plan.md         # Roadmap, architecture, links to stage docs
    └── stage-N-*.md    # Detailed plan + outcome for each stage
```

## Quick Start

### Prerequisites
- Node.js 24.16.0 (see `.nvmrc`)
- pnpm (via corepack: `corepack enable && corepack prepare pnpm@latest --activate`)
- Docker & Docker Compose

### Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   ```
   Defaults work as-is for local dev — no edits needed unless you changed ports/credentials.

3. **Start PostgreSQL** (in docker-compose)
   ```bash
   docker compose up -d postgres
   ```

4. **Initialize database** (Prisma migrations)
   ```bash
   pnpm --filter api exec prisma migrate dev --name init
   ```

5. **Run dev servers** (backend on :4000, frontend on :5173)
   ```bash
   pnpm dev
   ```

6. **Check health**
   ```bash
   curl http://localhost:4000/health
   # open http://localhost:5173 in browser
   ```

## Scripts

- `pnpm dev` — start dev servers (Nest + Vite, HMR enabled)
- `pnpm build` — build frontend + backend
- `pnpm lint` — ESLint across all apps & packages
- `pnpm docker:up` — start PostgreSQL container
- `pnpm docker:down` — stop PostgreSQL container

## Monorepo & Claude Code

This project is a learning vehicle for Claude Code features:
- **Plan mode** & `CLAUDE.md` (project rules)
- **Skills** & custom slash-commands
- **Subagents** (Explore, Plan, general-purpose)
- **MCP servers** (PostgreSQL inspection, GitHub)
- **Hooks** (lint/test on commit)
- **Workflows** & `loops` (multi-agent orchestration)
- **Agent view**, **agent teams**, **dynamic workflows**

See `docs/plan.md` for the full roadmap and stage-by-stage breakdown of which Claude Code features are tested at each phase.

## Tech Stack

- **Frontend**: Vite, React 19+, TypeScript, React Router v7, TanStack Query v5, zustand, shadcn/ui, Tailwind v4, react-hook-form + zod, recharts
- **Backend**: NestJS, Prisma, PostgreSQL, `@nestjs/config`, `@nestjs/terminus`
- **DevOps**: pnpm workspaces, Turborepo, Docker Compose, GitHub (future CI/CD)
- **Testing**: Jest (backend), Vitest + React Testing Library (frontend)

## Auth & Database

- **Authentication**: Google OAuth (placeholder modules in `apps/api/src/auth/`, implemented at Stage 4)
- **Database**: PostgreSQL in Docker, managed by Prisma migrations
- **Data models**: User, Link (short links), Click (analytics), User-Agent breakdown

See `CLAUDE.md` for running commands and project conventions.

## License

Educational project for internal use during Claude Code training course.
