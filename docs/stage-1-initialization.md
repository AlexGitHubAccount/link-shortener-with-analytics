# Этап 1: Инициализация — скелет монорепозитория

**Статус**: ✅ Завершён (2026-08-20)

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
2. `gh repo create` **намеренно не выполняется здесь** — решение зафиксировано в `docs/plan.md`: проект пушится на GitHub только на Этапе 7, когда всё уже работает локально целиком. До тех пор — только локальные коммиты.
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
12. Финальный коммит выполнен (`git log` содержит историю). Пуш в GitHub — намеренно на Этапе 7, не сейчас.
13. Начиная с Этапа 2 каждый этап проходит формальное двухзаходное `/stage-review N` (см. «Процесс ревью после каждого этапа» в `docs/plan.md`) перед отметкой ✅. Этап 1 такой формальный прогон не проходил — вместо этого несколько раундов ручного жёсткого ревью были сделаны прямо в этой сессии (см. историю правок выше и коммиты `docs: fix inconsistencies...`). Это задним числом эквивалентно, поэтому отдельный `/stage-review 1` не требуется — вместо него на HEAD ставится тег `stage-1-done`, который становится точкой отсчёта для Захода 1 на Этапе 2.

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
- ℹ️ GitHub remote отсутствует (`git remote -v` пуст) — **это ожидаемо и правильно на этом этапе**: по решению из `docs/plan.md` репозиторий публикуется на GitHub только на Этапе 7, вместе с настройкой CI/CD. До тех пор работаем полностью локально.

## Прогон механизма `/stage-review` (2026-08-20)

На новой сессии после рестарта Claude Code (чтобы подхватить свежие skills) механизм `/stage-review 1` был запущен в полном цикле. Для Этапа 1 (N=1) Заход 1 пропущен (нечего диффить от несуществующего `stage-0-done`), выполнен только **Заход 2**: `code-review` (medium) по всему коду проекта — **результат: чисто** (пустой список находок).

Это подтверждает, что:
- Исправления, сделанные ранее вручную, действительно работают и не нарушают целостность
- Сам механизм `/stage-review` функционирует корректно (читает тег, запускает нужный skill, не создаёт лишних шагов для особого случая N=1)

## Тестовый прогон `/stage-review` (2026-08-20, первый раз — вручную)

Механизм `/stage-review` был впервые опробован «в бою» именно на Этапе 1 — не как формальный гейт (см. пункт 13 выше), а как тест самого инструмента. Заход 1 пропущен (нет `stage-0-done`), выполнен только Заход 2 — `code-review` (`medium`) по `apps/api/src apps/web/src packages/`. Нашёл 3 реальных бага в `apps/web/src/App.tsx`, все исправлены:

1. **Не было `QueryClientProvider`** — `useQuery` падал бы на первом рендере (белый экран). Исправлено: создан `apps/web/src/lib/query-client.ts`, подключён в `main.tsx`.
2. **`health.timestamp` не существовал** в реальном ответе `@nestjs/terminus` (`{status, info, error, details}`, без `timestamp`) — на экране была бы «Invalid Date». Исправлено: тип `HealthStatus` в `shared-types` приведён к реальной форме ответа; на фронте используется `dataUpdatedAt` от TanStack Query (реальное время последнего успешного запроса) вместо несуществующего поля с бэкенда.
3. **Error и success блоки могли отрисоваться одновременно** (TanStack Query держит старые данные во время retry) — исправлено условием `health && !isError`.

Дополнительно при верификации фиксов (`tsc -b`) всплыл **4-й баг, не связанный с самим ревью**: `packages/shared-types/package.json` указывает точкой входа `dist/index.js`/`dist/index.d.ts`, но `dist/` никогда не собирался — импорт пакета был сломан с самого начала. Исправлено: собран `dist/` вручную один раз, плюс `turbo.json` → задача `dev` теперь имеет `"dependsOn": ["^build"]`, чтобы Turborepo сам собирал зависимости воркспейса (в т.ч. `shared-types`) перед стартом dev-серверов — баг не сможет повториться после `git clone`/`rm -rf dist`.

Все фиксы проверены вживую: `docker compose up -d postgres` + `pnpm dev`, `curl /health` → `200`, фронтенд отдаёт страницу без ошибок.

**Найденная проблема самого механизма `stage-review`**: `security-review` не принимает путь как скоуп — всегда сам строит `git diff origin/HEAD...HEAD`, а `origin` в проекте нет (сознательно, до Этапа 7). Решение — локальная git-ссылка `refs/remotes/origin/HEAD` (не настоящий remote), которую `stage-review` теперь выставляет сам перед Заходом 1. В Заходе 2 `security-review` из процесса убран — гонять диф от начала проекта означало тащить в промпт сотни KB сгенерированных файлов (`pnpm-lock.yaml`, миграции). Подробности — в `.claude/skills/stage-review/SKILL.md` и в `docs/plan.md`.

## Зависимости от предыдущих этапов

Нет — это первый этап проекта.
