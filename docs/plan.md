# План: сокращатель ссылок с аналитикой — учебный проект по Claude Code

## Контекст

Пользователь — frontend-разработчик (5 лет опыта), в рамках корпоративного практического курса по Claude Code получил задание построить приложение «сокращатель ссылок с аналитикой». Цель — не просто получить рабочее приложение, а на его материале **последовательно пройти как можно больше повседневных возможностей Claude Code**: CLAUDE.md/rules, plan mode, custom slash-команды, skills, все виды subagents, MCP-серверы, hooks, workflows и loops, а в конце — CI/CD на GitHub Actions.

Технический стек и ключевые продуктовые решения согласованы с пользователем напрямую. Этот документ — общий план-обзор: контекст, архитектура, согласованные решения и карта из 8 этапов. **Детальный план каждого этапа вынесен в отдельный файл** (`stage-N-*.md` в этой же папке) — там конкретные файлы, модули, эндпоинты, команды и шаги верификации. Перед стартом каждого этапа его файл можно скорректировать по факту — детали реализации могут поменяться по ходу проекта, это нормально.

## Навигация по документации проекта

Если вы новый человек на проекте — вот куда смотреть:

| Документ | Что там |
|---|---|
| [`README.md`](../README.md) | Быстрый старт: как поднять проект локально за 5 команд |
| [`CLAUDE.md`](../CLAUDE.md) | Конвенции кода, структура файлов, частые ошибки и их решения — читать перед тем, как писать код |
| `docs/plan.md` (этот файл) | Архитектура, согласованные решения, статус этапов |
| `docs/stage-N-*.md` | Подробный план и факт выполнения конкретного этапа |

## Согласованные решения

- **Монорепозиторий**: frontend + backend + PostgreSQL в одном репо.
- **Frontend**: Vite + React + TypeScript.
- **Backend**: NestJS.
- **Аналитика**: «средний» уровень — график переходов по дням/неделям, топ referrer, разбор User-Agent (браузер/ОС/тип устройства). Без геолокации по IP.
- **Авторизация**: Google OAuth, у каждого пользователя свои ссылки и своя аналитика.
- **Docker**: обязателен.
- **GitHub**: код должен быть размещён на GitHub с первого коммита ⚠️ *репозиторий пока только локальный — remote не создан, см. открытый пункт в [stage-1-initialization.md](./stage-1-initialization.md)*; CI/CD (GitHub Actions) — отдельный, более поздний этап.
- **Юнит-тесты**: на фронтенде — Vitest + React Testing Library; на бэкенде — Jest (дефолтный тест-раннер NestJS).
- Остальной тулинг — «самое популярное»: pnpm + Turborepo, Prisma, TanStack Query, zustand, shadcn/ui + Tailwind, react-hook-form + zod, recharts.

## Виды агентов Claude Code, которые хотим опробовать по ходу проекта

- **Subagents** — делегированные исполнители в рамках одной сессии (Agent-тул: Explore, Plan, general-purpose, кастомные).
- **Agent view** — единый экран мониторинга фоновых сессий (`claude agents`). Пригодится при нескольких одновременных фоновых задачах/подагентах.
- **Agent teams** — несколько координируемых сессий с общим списком задач и обменом сообщениями под управлением лидера (экспериментальная функция, требует явного включения). Хорошо ложится на достаточно крупную фичу, которую можно распилить на параллельные куски.
- **Dynamic workflows** — скрипт (инструмент Workflow), который запускает много подагентов и взаимно проверяет их результаты; для объёма работы, который не покрыть за один проход.

## Архитектура приложения

### Структура монорепозитория

pnpm workspaces + Turborepo:

```
link-shortener/
├── apps/
│   ├── api/                # NestJS backend
│   └── web/                 # Vite + React frontend
├── packages/
│   └── shared-types/        # общие TS-типы/DTO для FE и BE
├── docker-compose.yml
├── .env.example / .env
├── package.json / pnpm-workspace.yaml / turbo.json
└── README.md
```

`packages/eslint-config` и `packages/tsconfig` (общие ESLint/tsconfig-конфиги для всех воркспейсов) в первоначальном плане закладывались как возможное будущее расширение — по факту не создавались, т.к. пока хватает конфигов на уровне каждого приложения. Заводить их стоит только когда дублирование правил между `apps/api` и `apps/web` реально начнёт мешать.

### Backend (NestJS + Prisma)

ORM — **Prisma v6** (стабильная — v7.9.1 пробовали на Этапе 1, но она требует `prisma.config.ts` и отдельной конфигурации datasource для миграций; для учебного проекта на раннем этапе это лишняя сложность, см. [stage-1-initialization.md](./stage-1-initialization.md)).

Модули: `prisma` (глобальный), `health` (`GET /health`, реализован), `auth` (заготовка — Google OAuth реализуется на Этапе 4), `users` (заготовка), `links` (приватный CRUD ссылок — Этап 2), `redirect` (публичный `GET /:code`, отдельно от `links` — без auth guard, высокочастотный путь — Этап 2), `analytics` (агрегация кликов, парсинг User-Agent — Этап 5).

Схема данных: `User` (googleId, email...), `Link` (originalUrl, shortCode, isCustomAlias, expiresAt, userId...), `Click` (linkId, clickedAt, referrer, browser, os, deviceType), `enum DeviceType`. Полная схема — `apps/api/prisma/schema.prisma`.

### Frontend (Vite + React + TS)

`react-router-dom` v7, `@tanstack/react-query` v5 (серверные данные), `zustand` (только auth/UI-стейт), `shadcn/ui` + Tailwind v4, `react-hook-form` + `zod`, `recharts` для графиков.

Структура: `routes/` (Dashboard, LinkAnalytics, Login, NotFound), `components/ui/` (shadcn), `features/{links,analytics,auth}/`, `lib/` (api-client, query-client), `stores/auth.store.ts`.

### Docker

В docker-compose — **только PostgreSQL** (`postgres:16-alpine`, healthcheck, volume `pgdata`). Backend и frontend на этапе разработки запускаются нативно через `turbo run dev` — сохраняем быстрый HMR.

## Роадмап по этапам

| № | Этап | Цель | Статус | Файл |
|---|---|---|---|---|
| 1 | Инициализация | Скелет монорепозитория, оба сервера стартуют, FE↔BE связаны | ✅ Завершён | [stage-1-initialization.md](./stage-1-initialization.md) |
| 2 | Backend Core | CRUD `/links` + публичный редирект `/:code` с фиксацией кликов | ⏳ Запланирован | [stage-2-backend-core.md](./stage-2-backend-core.md) |
| 3 | Frontend | Dashboard, форма создания ссылки, список ссылок | ⏳ Запланирован | [stage-3-frontend.md](./stage-3-frontend.md) |
| 4 | Аутентификация | Google OAuth, JWT, изоляция данных по пользователю | ⏳ Запланирован | [stage-4-authentication.md](./stage-4-authentication.md) |
| 5 | Аналитика | Агрегация кликов, UA-парсинг, графики на странице ссылки | ⏳ Запланирован | [stage-5-analytics.md](./stage-5-analytics.md) |
| 6 | Тестирование/QA | Unit + component + E2E тесты, покрытие >80% | ⏳ Запланирован | [stage-6-testing-qa.md](./stage-6-testing-qa.md) |
| 7 | CI/CD | GitHub Actions: lint/test/build на каждый push/PR | ⏳ Запланирован | [stage-7-cicd.md](./stage-7-cicd.md) |
| 8 | Полировка | Swagger-документация, README, финальный отчёт | ⏳ Запланирован | [stage-8-polish.md](./stage-8-polish.md) |

Каждый следующий этап реализуется в отдельной сессии: открываем соответствующий `stage-N-*.md`, при необходимости корректируем детали по факту текущего состояния кода, выполняем, отмечаем статус ✅ и обновляем эту таблицу.
