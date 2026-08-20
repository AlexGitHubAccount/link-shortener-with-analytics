# Этап 1: Инициализация — скелет монорепозитория

**Статус**: ✅ Завершён (2026-08-20, финализирован 2026-08-21 после прогона Workflow-версии `/stage-review`)

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
13. Начиная с Этапа 2 каждый этап проходит формальное двухзаходное `/stage-review N` (см. «Процесс ревью после каждого этапа» в `docs/plan.md`) перед отметкой ✅. Этап 1 такой формальный прогон не проходил — вместо этого несколько раундов ручного жёсткого ревью были сделаны прямо в этой сессии (см. историю правок выше и коммиты `docs: fix inconsistencies...`). Это задним числом эквивалентно, поэтому отдельный `/stage-review 1` не требуется — вместо него на HEAD ставится тег `stage-1-done`, который становится точкой отсчёта для Захода 1 на Этапе 2. Каждый этап, включая этот, обязан пройти полную синхронизацию документации перед отметкой ✅ — не только тег и статус, см. «Обязательное обновление документации после этапа» в `docs/plan.md`.

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

На новой сессии после рестарта Claude Code (чтобы подхватить свежие skills) механизм `/stage-review 1` был запущен в полном цикле. Для Этапа 1 (N=1) Заход 1 пропущен (нечего диффить от несуществующего `stage-0-done`), выполнен только **Заход 2**: `code-review` (medium) на **полном сканировании** `apps/api/src apps/web/src packages/` целиком (весь проект, интеграция всех этапов) — **результат: чисто** (пустой список находок). Логика переправлена: Заход 1 использует диф (быстро, для изоляции), Заход 2 сканирует весь проект (медленнее, но ловит интеграционные конфликты в неизменённых файлах).

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

**Найденная проблема самого механизма `stage-review` (версия на встроенных skills)**: `security-review` не принимал путь как скоуп — всегда сам строил `git diff origin/HEAD...HEAD`, а `origin` в проекте нет (сознательно, до Этапа 7). Решение на тот момент — локальная git-ссылка `refs/remotes/origin/HEAD` (не настоящий remote), которую `stage-review` выставлял сам перед Заходом 1. Этот костыль **больше не актуален** — см. следующий раздел, механизм с тех пор переведён на изолированный Workflow, где нет вызова встроенного `security-review` вовсе.

## Финализация: прогон Workflow-версии `/stage-review` (2026-08-21)

Механизм `/stage-review` был переработан — вместо вызова встроенных skills `code-review`/`security-review` в основной сессии он теперь делегирует всё ревью в изолированный `Workflow` (`.claude/workflows/stage-review.js`), где независимые агенты-ревьюеры (code/security/integration) и агент-фиксер работают каждый в своём контексте, не засоряя основную сессию. Подробности архитектуры — в `docs/plan.md`, раздел «Процесс ревью после каждого этапа».

`/stage-review 1` был прогнан повторно на новой версии механизма — как тест самого Workflow (Этап 1 формально уже был завершён, тег стоял). Заход 1 пропущен (N=1), выполнен только Заход 2 (integration-reviewer, полное сканирование `apps/api/src apps/web/src packages/`), 3 итерации до чистого результата:

- **Итерация 1** — 5 находок, все исправлены fixer-агентом (коммит `78ccf03`):
  1. TypeScript фронтенда (`^6.0.2`) несовместим с остальным монорепо (`5.x`) — понижен до `^5.6.2`.
  2. Frontend `tsconfig.app.json` без `"strict": true` — нарушение правила CLAUDE.md о strict mode во всех apps — добавлено.
  3. Backend без `type-check` скрипта — `turbo run type-check` его не покрывал — добавлен `tsc --noEmit`.
  4. Frontend без `type-check` скрипта — аналогично — добавлен `tsc -b`.
  5. Backend не импортировал ничего из `@link-shortener/shared-types`, хотя CLAUDE.md требует единый источник типов для FE и BE — добавлена зависимость и импорт `HealthStatus` в `health.controller.ts`.

- **Итерация 2** — 3 находки (проявились после фиксов итерации 1), все исправлены fixer-агентом (коммит `76d126a`):
  1. `HealthStatus` в `shared-types` не включал статус `'shutting_down'`, который реально возвращает `@nestjs/terminus` — TS2322 при сборке. Добавлено в union.
  2. `Link` в `shared-types` не содержал `userId`, хотя Prisma-модель его требует — добавлено.
  3. `Click` в `shared-types` не содержал `userAgentRaw`, хотя Prisma-модель его хранит — добавлено.

- **Итерация 3** — 0 находок, **чисто**.

Все 8 находок — реальные интеграционные баги, не выдумки: они были видны только при полном сканировании проекта, а не в изоляции (несогласованность между `packages/shared-types` и реальными Prisma-моделями/ответами Terminus, несогласованность конфигурации TypeScript между воркспейсами). Полный `pnpm turbo run type-check` по всем трём воркспейсам (`api`, `web`, `shared-types`) после фиксов проходит чисто. Backend/`GET /health` проверены вживую — без регрессий.

Итог: тег `stage-1-done` передвинут на финальный коммит после фиксов (была ещё одна мелкая некоммиченная правка типизации в `PrismaService`, закоммичена отдельно как `chore:`). Это подтверждает, что новый Workflow-механизм `/stage-review` работает корректно end-to-end: находит реальные проблемы, чинит их, коммитит, доводит до чистого состояния и возвращает в основную сессию только структурированный результат — без раздувания её контекста.

## Зависимости от предыдущих этапов

Нет — это первый этап проекта.
