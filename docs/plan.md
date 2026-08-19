# План: сокращатель ссылок с аналитикой — учебный проект по Claude Code

## Контекст

Пользователь — frontend-разработчик (5 лет опыта), в рамках корпоративного практического курса по Claude Code получил задание построить приложение «сокращатель ссылок с аналитикой». Цель — не просто получить рабочее приложение, а на его материале **последовательно пройти как можно больше повседневных возможностей Claude Code**: CLAUDE.md/rules, plan mode, custom slash-команды, skills, все виды subagents, MCP-серверы, hooks, workflows и loops, а в конце — CI/CD на GitHub Actions.

Технический стек и ключевые продуктовые решения уже согласованы с пользователем напрямую. Директория проекта сейчас полностью пуста, git не инициализирован. План описывает архитектуру всего приложения и роадмап тем Claude Code по этапам, но **в этой сессии реализуется только Этап 1 — скелет монорепозитория** (по явному решению пользователя: сначала только скаффолдинг + базовые правила, без бизнес-логики). Этапы 2 и далее (backend-логика, frontend-фичи, авторизация, аналитика, тестирование, CI/CD) будут реализовываться по одному в следующих сессиях — этот документ переезжает в сам репозиторий проекта (см. шаг с `docs/plan.md` в Этапе 1) и служит живым роадмапом: каждая следующая сессия открывает его, отмечает, что сделано, и продолжает со следующего этапа.

## Согласованные решения

- **Монорепозиторий**: frontend + backend + PostgreSQL в одном репо.
- **Frontend**: Vite + React + TypeScript.
- **Backend**: NestJS.
- **Аналитика**: «средний» уровень — график переходов по дням/неделям, топ referrer, разбор User-Agent (браузер/ОС/тип устройства). Без геолокации по IP.
- **Авторизация**: Google OAuth, у каждого пользователя свои ссылки и своя аналитика (реализация — на будущем этапе, сейчас только заготовка модуля).
- **Docker**: обязателен.
- **GitHub**: код должен быть размещён на GitHub уже сейчас; CI/CD (GitHub Actions) — отдельный, более поздний этап.
- **Юнит-тесты**: на фронтенде — Vitest + React Testing Library (компонентные и unit-тесты); на бэкенде — Jest (дефолтный тест-раннер NestJS, идёт «из коробки» со скаффолдом Nest CLI, менять его на Vitest смысла нет).
- Остальной тулинг пользователь явно доверил выбрать «самое популярное»: pnpm + Turborepo, Prisma, TanStack Query, zustand, shadcn/ui + Tailwind, react-hook-form + zod, recharts.

## Виды агентов Claude Code, которые хотим опробовать по ходу проекта

- **Subagents** — делегированные исполнители в рамках одной сессии (Agent-тул: Explore, Plan, general-purpose, кастомные). Уже используются на этапе планирования.
- **Agent view** — единый экран мониторинга фоновых сессий (`claude agents`). Пригодится, когда одновременно будет запущено несколько фоновых задач/подагентов — проверять статус «одним взглядом».
- **Agent teams** — несколько координируемых сессий с общим списком задач и обменом сообщениями под управлением лидера (экспериментальная функция, по умолчанию выключена — потребуется явно включить). Хорошо ложится на достаточно крупную фичу, которую можно распилить на параллельные куски.
- **Dynamic workflows** — скрипт (инструмент Workflow), который запускает много подагентов и взаимно проверяет их результаты; для объёма работы, который не покрыть за один проход (аудит кодовой базы, массовая генерация/проверка тестов, ревью с нескольких сторон).

## Архитектура приложения

### Структура монорепозитория

pnpm workspaces + Turborepo (быстрее и проще Nx для проекта такого размера, легко ляжет на GitHub Actions remote-cache в будущем CI/CD):

```
link-shortener/
├── apps/
│   ├── api/                # NestJS backend
│   └── web/                 # Vite + React frontend
├── packages/
│   ├── shared-types/        # общие TS-типы/DTO для FE и BE
│   ├── eslint-config/
│   └── tsconfig/
├── docker-compose.yml
├── .env.example / .env
├── package.json / pnpm-workspace.yaml / turbo.json
└── README.md
```

### Backend (NestJS + Prisma)

ORM — **Prisma** (декларативная схема, типобезопасные миграции, проще сочетается с Nest DI, чем TypeORM; сама `schema.prisma` — удобный «единый источник правды», в том числе для будущих skills/subagents).

Модули: `prisma` (глобальный), `health` (`GET /health` через `@nestjs/terminus`), `auth` (заготовка под Google OAuth), `users`, `links` (приватный CRUD ссылок), `redirect` (публичный `GET /:code`, отдельно от `links` — без auth guard, высокочастотный путь), `analytics` (агрегация кликов, парсинг User-Agent).

Схема данных: `User` (googleId, email...), `Link` (originalUrl, shortCode, isCustomAlias, expiresAt, userId...), `Click` (linkId, clickedAt, referrer, browser, os, deviceType), `enum DeviceType`. Полная схема — как в исследовании ниже, вносится в `apps/api/prisma/schema.prisma` сразу (структура данных), бизнес-логика CRUD/auth — на следующих этапах.

### Frontend (Vite + React + TS)

`react-router-dom` v7, `@tanstack/react-query` v5 (серверные данные), `zustand` (только auth/UI-стейт), `shadcn/ui` + Tailwind v4 (компоненты копируются в репо как читаемый код — удобно для работы агентов), `react-hook-form` + `zod`, `recharts` для графиков.

Структура: `routes/` (Dashboard, LinkAnalytics, Login, NotFound), `components/ui/` (shadcn), `features/{links,analytics,auth}/`, `lib/` (api-client, query-client), `stores/auth.store.ts`.

### Docker

В docker-compose — **только PostgreSQL** (`postgres:16-alpine`, healthcheck, volume `pgdata`). Backend и frontend на этапе разработки запускаются нативно через `turbo run dev` — сохраняем быстрый HMR. Полная докеризация всего стека — кандидат для отдельного будущего этапа (вместе с CI/CD).

## Роадмап тем Claude Code по этапам проекта

Ориентир для будущих сессий, не жёсткий — по ходу дела будем уточнять вместе с пользователем:

1. **Инициализация (этот план)** — plan mode, CLAUDE.md / project rules, git + GitHub-репозиторий.
2. **Backend core (Links CRUD + Redirect)** — custom slash-команды (например, генерация Nest-модуля по паттерну проекта), skills, MCP-сервер для Postgres (инспекция БД прямо из Claude Code).
3. **Frontend (Dashboard, формы, список ссылок)** — subagents разных типов (Explore/Plan уже в ходу; кастомные subagents 
вроде «ui-reviewer»), MCP claude-in-chrome для визуальной проверки UI.
4. **Аутентификация (Google OAuth)** — hooks (например, pre-commit lint/test через settings.json), возможен кастомный subagent «security-reviewer».
5. **Аналитика (сбор кликов, UA-парсинг, графики)** — фича достаточно крупная, чтобы распилить на параллельные куски (backend-агрегация + frontend-графики) и попробовать **agent teams** (координируемые сессии под лидером с общим списком задач); плюс `/code-review`.
6. **Тестирование/QA** — юнит- и компонентные тесты (Vitest + RTL на фронте, Jest на бэке); написание/аудит тестов по многим файлам с взаимной проверкой результатов — повод попробовать **dynamic workflows** (Workflow-тул); при параллельном запуске нескольких фоновых прогонов — **agent view** для мониторинга «одним взглядом»; `/loop` для итеративного прогона тестов и багфиксов; MCP Playwright/Chrome для E2E.
7. **CI/CD (GitHub Actions)** — MCP GitHub, возможно scheduled/cron-агенты.
8. **Полировка/документация** — Artifacts для отчётов, кастомизация output styles/statusline (опционально).

## Этап 1 (реализуется сейчас): скелет монорепозитория + базовые rules

1. **Git и гигиена репозитория**: `git init`, `.gitignore` (node_modules, dist, .env, .turbo и т.д.), `.nvmrc`, `README.md`.
2. **GitHub**: создать репозиторий через `gh repo create link-shortener-with-analytics --private` и запушить первый коммит после скаффолдинга.
3. **pnpm**: `corepack enable && corepack prepare pnpm@latest --activate` (сейчас в системе только npm).
4. **Root workspace**: `package.json` (private), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `turbo.json` (pipeline `dev`/`build`/`lint`), devDependencies `turbo`, `typescript`, `prettier`.
5. **Backend-скаффолд**: `@nestjs/cli new apps/api`, зависимости `@nestjs/config`, `@nestjs/terminus`, `prisma`, `@prisma/client`; `prisma init`; внести в `schema.prisma` модели `User`/`Link`/`Click`/`DeviceType`; создать модули `prisma`, `health` (`GET /health` через Prisma `SELECT 1`); настроить CORS на `http://localhost:5173`, порт из `PORT ?? 4000`.
6. **Frontend-скаффолд**: `pnpm create vite@latest apps/web -- --template react-ts`; зависимости `react-router-dom`, `@tanstack/react-query`, `zustand`, `react-hook-form`, `zod`, `recharts`; Tailwind v4 + `shadcn@latest init`; на главной странице — fetch `/health` через TanStack Query как проверка связки FE↔BE.
7. **Docker + БД**: `docker-compose.yml` (только postgres), `.env.example`/`.env`; `docker compose up -d postgres`; `prisma migrate dev --name init`.
8. **packages/shared-types**: пакет-заготовка с одним placeholder-типом — проверить, что `workspace:*` резолвится в обоих приложениях.
9. **CLAUDE.md**: описать стек, структуру монорепо, ключевые команды (`pnpm dev`, `docker compose up -d postgres`, `pnpm --filter api exec prisma migrate dev`), конвенции (TS strict, разделение apps/packages, где лежат DTO), и пометку, что проект используется для практики возможностей Claude Code.
9a. **docs/plan.md**: скопировать в репозиторий этот документ целиком (архитектура + роадмап тем Claude Code по этапам + отметка о завершённых этапах) — чтобы план жил вместе с проектом и следующая сессия могла открыть его и продолжить с Этапа 2, не восстанавливая контекст заново. После завершения каждого этапа — актуализировать этот файл (отмечать пройденное, уточнять следующий этап).
10. **Корневые скрипты и проверка**: `dev`/`build`/`lint`/`docker:up`/`docker:down` в root `package.json`; `pnpm install`; `pnpm dev` поднимает Nest (`:4000`) и Vite (`:5173`) параллельно; `curl http://localhost:4000/health` → `200`; `http://localhost:5173` показывает статус API.
11. Финальный коммит и пуш в GitHub.

### Ключевые файлы этапа 1

`pnpm-workspace.yaml`, `turbo.json`, `docker-compose.yml`, `apps/api/prisma/schema.prisma`, `apps/api/src/main.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/prisma/prisma.service.ts`, `apps/web/src/main.tsx`, `apps/web/src/index.css`, `packages/shared-types/src/index.ts`, `CLAUDE.md`, `docs/plan.md`.

Модули `auth`, `links`, `redirect`, `analytics` создаются как пустые заготовки — бизнес-логика туда ляжет на следующих этапах вместе с соответствующими темами Claude Code.

## Верификация

- `docker compose ps` — postgres в статусе healthy.
- `pnpm --filter api exec prisma migrate dev` проходит без ошибок, таблицы созданы.
- `pnpm dev` поднимает оба сервиса без ошибок.
- `curl http://localhost:4000/health` возвращает `200 OK`.
- `http://localhost:5173` в браузере показывает статус API (подтверждает связку FE↔BE).
- `git log` содержит начальный коммит; репозиторий виден на GitHub.
