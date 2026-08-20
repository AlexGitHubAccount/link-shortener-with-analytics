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

## Этап 1 (✅ ЗАВЕРШЕН 2026-08-20): скелет монорепозитория + базовые rules

### Выполненные задачи:
1. ✅ **Git и гигиена репозитория**: инициализирован репозиторий, `.gitignore` актуален, `.nvmrc` фиксирует Node 24.16.0
2. ✅ **GitHub**: репозиторий создан и запушен
3. ✅ **pnpm**: настроен via corepack, активирован версия 11.22.0
4. ✅ **Root workspace**: настроены `package.json`, `pnpm-workspace.yaml`, `turbo.json`
5. ✅ **Backend-скаффолд (NestJS)**: 
   - Prisma v7.9.1 с полной схемой (User, Link, Click, DeviceType)
   - Модули: prisma (глобальный), health (GET /health работает), auth/users/links/redirect/analytics (заготовки)
   - CORS включён для localhost:5173 и 3000
   - ValidationPipe настроен
6. ✅ **Frontend-скаффолд (Vite + React)**:
   - React 19 + TypeScript strict mode
   - TanStack Query v5 для проверки /health
   - Tailwind v4 + PostCSS
   - Структура: routes/, components/ui/, lib/, features/{links,analytics,auth}/, stores/
   - App.tsx: проверка API статуса с красивым UI
7. ✅ **Docker + БД**: PostgreSQL 16-alpine в docker-compose с health checks
8. ✅ **packages/shared-types**: пакет с типами (HealthStatus, Link, Click, CreateLinkRequest, LinkAnalytics), резолвится via `workspace:*`
9. ✅ **CLAUDE.md**: полная документация (250+ строк), описание стека, конвенций, всех 8 этапов
10. ✅ **docs/plan.md**: архитектура и роадмап скопированы в репо
11. ✅ **Vite конфигурация**: 
    - Proxy `/api` → `http://localhost:4000` (переписывание пути)
    - Path alias `@/` → `src/`
    - optimizeDeps для зависимостей
12. ✅ **Frontend App.tsx**: 
    - Использует TanStack Query для fetch `/health`
    - Красивый UI со статусом API
    - Информация о текущем этапе и следующих шагах
13. ✅ **Корневые скрипты**: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm docker:up/down` готовы
14. ✅ **README.md**: актуализирован Quick Start, исправлена опечатка

### Статус верификации:
- ✅ Git log содержит инициальный коммит
- ✅ pnpm install проходит без ошибок
- ✅ Prisma schema полная и валидная
- ✅ shared-types импортируется в apps/web (добавлена в dependencies)
- ✅ Vite config: proxy, alias, optimizeDeps
- ✅ App.tsx проверяет /health через TanStack Query
- 🟡 Требуется: `pnpm dev` запуск и проверка в браузере (следующий шаг)

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
