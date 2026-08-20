# Этап 1: Инициализация — скелет монорепозитория

**Статус**: ✅ Завершён (2026-08-20) — за исключением одного открытого пункта: ⚠️ **GitHub-репозиторий не создан** (см. «Верификация» ниже). Сделать перед стартом Этапа 2.

## Цель этапа

Поднять пустой, но полностью рабочий монорепозиторий: backend и frontend стартуют, база данных доступна, FE и BE видят друг друга через `/health`. Без бизнес-логики — только скаффолдинг, конвенции и правила проекта.

## Темы Claude Code для практики

- **Plan mode** — весь этап спроектирован заранее в плане, согласован с пользователем через уточняющие вопросы, и только потом реализован.
- **CLAUDE.md / project rules** — базовые правила проекта фиксируются с первого дня, чтобы все последующие сессии видели единый источник правды по стеку и конвенциям.
- **Git + GitHub-репозиторий** — гигиена версионирования с первого коммита.

## Что реализовали

### Backend (NestJS + Prisma)
- Nest-скаффолд в `apps/api` (`@nestjs/cli new`).
- Модули: `prisma` (глобальный), `health` (`GET /health` через `@nestjs/terminus`, реальная проверка БД через `SELECT 1`), заготовки `auth`, `users`, `links`, `redirect`, `analytics`.
- Полная Prisma-схема (`apps/api/prisma/schema.prisma`): `User`, `Link`, `Click`, `enum DeviceType`.
- CORS на `http://localhost:5173` и `http://localhost:3000`, порт из `process.env.PORT ?? 4000`, глобальный `ValidationPipe`.
- **Prisma откачена с v7.9.1 на стабильную v6.19.3** — v7 требует сложной конфигурации через `prisma.config.ts` для миграций (breaking change: `datasource.url` больше не читается напрямую из `schema.prisma`), что избыточно для учебного проекта на раннем этапе.
- Добавлены `class-validator` и `class-transformer` — обязательные peer-зависимости для `ValidationPipe`, изначально не были установлены при скаффолде.

### Frontend (Vite + React + TS)
- Vite-скаффолд `react-ts` в `apps/web`, React 19, TypeScript strict mode.
- Зависимости: `react-router-dom` v7, `@tanstack/react-query` v5, `zustand`, `react-hook-form`, `zod`, `recharts`.
- Tailwind CSS v4 + `@tailwindcss/postcss` (v4 требует отдельный PostCSS-плагин вместо `tailwindcss` напрямую).
- Структура директорий подготовлена под будущие этапы: `routes/`, `components/ui/`, `features/{links,analytics,auth}/`, `lib/`, `stores/`.
- `App.tsx` переписан с vanilla-заглушки Vite на реальную проверку связки FE↔BE: `useQuery` дёргает `/api/health` (проксируется на `:4000/health`), показывает статус подключения.
- `vite.config.ts`: proxy `/api` → `http://localhost:4000` (с `rewrite`, убирающим префикс `/api`), path alias `@/` → `src/`, `optimizeDeps`.
- `@link-shortener/shared-types` подключена как `workspace:*`-зависимость.

### Инфраструктура
- pnpm workspaces (`apps/*`, `packages/*`) + Turborepo pipeline (`dev`/`build`/`lint`/`test`/`type-check`).
- `docker-compose.yml`: только PostgreSQL 16-alpine, healthcheck, именованный volume `pgdata`.
- `.pnpmfile.cjs`: разрешение build-скриптов для `prisma`/`@prisma/engines`/`unrs-resolver`.
- `packages/shared-types`: placeholder-типы (`HealthStatus`, `Link`, `Click`, `CreateLinkRequest`, `LinkAnalytics`) — реальные значения появятся на Этапах 2/5.
- `.nvmrc` (Node 24.16.0), корневые скрипты `dev`/`build`/`lint`/`docker:up`/`docker:down`.

## Пошаговый план работ (как выполнялось)

1. `git init`, `.gitignore`, `.nvmrc`, `README.md`.
2. ⚠️ `gh repo create` **запланирован, но фактически не выполнен** — репозиторий существует только локально, GitHub remote отсутствует (см. предупреждение в «Верификации» ниже). Перенесено в открытые задачи перед Этапом 2.
3. `corepack enable && corepack prepare pnpm@latest --activate`.
4. Root workspace: `package.json`, `pnpm-workspace.yaml`, `turbo.json`.
5. Backend-скаффолд: Nest CLI, зависимости, Prisma-схема, модули `prisma`/`health`, CORS.
6. Frontend-скаффолд: Vite React-TS, зависимости, Tailwind v4, health-check на главной странице.
7. Docker + БД: `docker-compose.yml`, `.env`/`.env.example`, `docker compose up -d postgres`, `prisma migrate dev --name init`.
8. `packages/shared-types`: пакет-заготовка, проверка `workspace:*`.
9. `CLAUDE.md` и `docs/plan.md` — документация стека и роадмапа.
10. Корневые скрипты, `pnpm install`, `pnpm dev` поднимает оба сервиса, `curl http://localhost:4000/health` → 200.
11. **Пост-ревью и исправления** (жёсткий ревью после первичного скаффолда выявил незавершённые куски):
    - Создана недостающая структура директорий `apps/web/src/{routes,components/ui,lib,features,stores}`.
    - `App.tsx` переписан с health-check вместо vanilla-заглушки.
    - `vite.config.ts` доконфигурирован (proxy, alias, optimizeDeps).
    - `shared-types` добавлена в зависимости фронтенда.
    - Опечатка в README исправлена.
    - Prisma v7 → v6 (миграции не запускались на v7 без доп. конфигурации).
    - Установлены `class-validator`/`class-transformer` (backend не стартовал без них).
12. Финальный коммит выполнен (`git log` содержит историю). **Пуш в GitHub не выполнен** — см. открытый пункт в «Верификации».

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `pnpm-workspace.yaml`, `turbo.json` | Монорепо-конфигурация |
| `docker-compose.yml`, `.env.example` | PostgreSQL для локальной разработки |
| `apps/api/prisma/schema.prisma` | Модели `User`/`Link`/`Click`/`DeviceType` |
| `apps/api/src/main.ts` | CORS, ValidationPipe, порт |
| `apps/api/src/health/health.controller.ts` | `GET /health` |
| `apps/api/src/prisma/prisma.service.ts` | Обёртка над `PrismaClient` |
| `apps/web/src/App.tsx` | Health-check UI через TanStack Query |
| `apps/web/vite.config.ts` | Dev-proxy `/api` → `:4000`, alias `@/` |
| `packages/shared-types/src/index.ts` | Общие типы FE/BE |
| `CLAUDE.md` | Правила и конвенции проекта |
| `docs/plan.md` | Общий план-обзор (этот документ — его продолжение) |

## Верификация

- ✅ `docker compose ps` — postgres в статусе healthy.
- ✅ `pnpm --filter api exec prisma migrate dev` проходит без ошибок, таблицы созданы.
- ✅ `pnpm dev` поднимает Nest (`:4000`) и Vite (`:5173`) параллельно без ошибок.
- ✅ `curl http://localhost:4000/health` возвращает `200 OK` с `{"status":"ok","info":{"database":{"status":"up"}}}`.
- ✅ `http://localhost:5173` в браузере показывает статус API (подтверждает связку FE↔BE).
- ✅ `git log` содержит коммиты (локально).
- ⚠️ **GitHub-репозиторий не создан**: `git remote -v` пуст, пуша не было. Это расходится с согласованным в `docs/plan.md` решением («код размещён на GitHub с первого коммита») и блокирует MCP GitHub (Этап 2) и CI/CD (Этап 7). Нужно выполнить перед стартом Этапа 2: `gh repo create link-shortener-with-analytics --private --source=. --remote=origin --push` (или вручную создать репозиторий на github.com и добавить `git remote add origin <url>` + `git push -u origin master`).

## Зависимости от предыдущих этапов

Нет — это первый этап проекта.
