# Этап 3: Frontend — Dashboard, формы, список ссылок

**Статус**: ✅ Завершён (2026-08-21)

## Цель этапа

Кликабельный UI поверх Этапа 2: пользователь видит форму создания короткой ссылки, список уже созданных ссылок, может скопировать/удалить ссылку и перейти по ней — всё через реальные API-запросы к backend.

## Темы Claude Code для практики

- **Разные типы subagents**: `Explore` (найти существующие паттерны компонентов/health-check как референс перед добавлением новых), `Plan` (спроектировать разбивку на features/routes перед реализацией), кастомный subagent `ui-reviewer` (проверяет доступность и консистентность верстки после каждой готовой фичи).
- **MCP `claude-in-chrome`** — визуальная проверка UI в реальном браузере: скриншоты, заполнение форм, клики, чтение консоли на ошибки.

## Что реализуем

### `lib/`
- `api-client.ts` — тонкая обёртка над `fetch`: базовый URL `/api` (проксируется Vite-конфигом на `:4000`), типизированные методы `get/post/patch/delete`, единая обработка HTTP-ошибок (не-2xx → выброс типизированной ошибки с телом ответа).
- `query-client.ts` — инстанс `QueryClient` с дефолтными опциями (`staleTime`, `retry`), экспортируется для `QueryClientProvider` в `main.tsx`.

### `features/links/`
- `useLinks.ts` — `useQuery(['links'], ...)`.
- `useCreateLink.ts`, `useDeleteLink.ts` — `useMutation` с инвалидацией `['links']` после успеха.
- `CreateLinkForm.tsx` — `react-hook-form` + `zod`-резолвер на основе `CreateLinkRequest` из `shared-types`; поля `originalUrl` (обязательное, валидный URL), `customCode` (опционально), `title` (опционально); показывает ошибки валидации инлайн.
- `LinksList.tsx` — таблица/карточки ссылок: короткий URL (кликабельный), original URL (обрезанный с tooltip), кнопка «копировать» (`navigator.clipboard`), кнопка удаления с подтверждением.

### `routes/`
- `Dashboard.tsx` — главная страница: `CreateLinkForm` + `LinksList`.
- `NotFound.tsx` — 404-страница для неизвестных фронтенд-роутов.
- Роутинг через `react-router-dom` v7 (`createBrowserRouter` в `main.tsx`): `/` → Dashboard, `*` → NotFound; уже сейчас закладываем маршруты `/login` и `/links/:id`, которые заполнятся на Этапах 4–5 (пока можно как placeholder-компоненты).

### UI-кит
- `shadcn/ui init` (`pnpm dlx shadcn@latest init`), добавить базовые компоненты: `button`, `input`, `card`, `table`, `toast` (уведомления об успехе/ошибке операций).
- Текущий health-check виджет из Этапа 1 либо убирается с главной страницы, либо переезжает в компактный dev-only индикатор в углу экрана (решить по вкусу на этапе реализации).

## Пошаговый план работ

1. `Explore`-агент анализирует текущую структуру `App.tsx` и уже созданные директории (`routes/`, `features/`, `lib/`) как референс паттернов проекта.
2. `Plan`-агент проектирует разбивку компонентов/хуков на features и routes перед написанием кода.
3. Настроить `react-router-dom` v7 в `main.tsx`.
4. Реализовать `api-client.ts` и `query-client.ts`.
5. `shadcn init` + добавить нужные компоненты.
6. Реализовать `CreateLinkForm` с `react-hook-form`+`zod`-валидацией.
7. Реализовать `LinksList` на данных из `useLinks`.
8. Собрать `Dashboard.tsx` из формы и списка.
9. Кастомный subagent `ui-reviewer` проверяет готовую страницу (доступность, консистентность отступов/цветов с остальным UI).
10. Через `claude-in-chrome`: визуальная проверка — заполнить форму, отправить, увидеть новую ссылку в списке, кликнуть по короткому URL и убедиться, что происходит редирект на `originalUrl`.
11. Прогнать `/stage-review 3` (см. `docs/plan.md`) — только после чистого результата статус меняется на ✅. Обязательно выполнить полную синхронизацию документации («Обязательное обновление документации после этапа» в `docs/plan.md`) — не только статус, но и раздел о том, как реализация шла по факту, если были отклонения от плана.

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `apps/web/src/lib/api-client.ts` | Обёртка над `fetch`, нормализация ошибок NestJS |
| `apps/web/src/lib/config.ts` | `REDIRECT_BASE_URL` — редирект не проксируется через `/api` |
| `apps/web/src/lib/query-client.ts` | Инстанс TanStack Query |
| `apps/web/src/features/links/*` | Хуки и компоненты работы со ссылками |
| `apps/web/src/routes/{Dashboard,NotFound,Login,LinkDetail}.tsx` | Страницы (Login/LinkDetail — заглушки Этапов 4/5) |
| `apps/web/src/components/DevHealthIndicator.tsx` | Health-check со Stage 1, перенесённый в угловой индикатор |
| `apps/web/src/main.tsx` | Роутинг (`createBrowserRouter`) вместо `App.tsx`-заглушки |
| `apps/web/src/components/ui/*` | shadcn-компоненты |
| `apps/web/components.json` | Конфиг shadcn CLI |
| `packages/shared-types/src/index.ts` | `createLinkRequestSchema` (общая zod-схема FE/BE), реальный `Link` |
| `.claude/agents/ui-reviewer.md` | Кастомный subagent |

## Верификация

- `pnpm dev` — оба сервера работают.
- Через `claude-in-chrome`: создание ссылки через форму → появляется в списке → клик по короткому URL приводит на `originalUrl`.
- `pnpm --filter web lint` — чист.
- Консоль браузера (`read_console_messages`) не содержит ошибок React/сети.

## Как выполнялось по факту

Использованы `Explore`- и `Plan`-агенты на старте (шаги 1-2 плана) — Explore изучил текущую структуру `apps/web/src`, реальный API-контракт Этапа 2 и зависимости; Plan спроектировал разбивку файлов и порядок реализации на основе этого отчёта. План в целом реализован как задумано, с несколькими находками и отклонениями:

- **shadcn/ui**: инициализирован с `-b radix -p nova` (Radix UI + пресет Nova) — конкретный выбор библиотеки/пресета не был зафиксирован в исходном плане, выбран как разумный дефолт.
- **Баг CLI shadcn с TS project references**: корневой `tsconfig.json` — solution-style файл (`files: [], references: [...]`) без собственных `compilerOptions`. `shadcn init` читает алиас `@/` из корневого файла напрямую, не проходя по `references` в `tsconfig.app.json`, поэтому без `paths` на корневом уровне CLI сгенерировал файлы в буквальную папку `./@/` вместо `src/`. Исправлено добавлением `baseUrl`/`paths` в **оба** `tsconfig.json` и `tsconfig.app.json` (изначально `@/` был только в `vite.config.ts` — сам TypeScript про алиас не знал).
- **`@hookform/resolvers`** отсутствовал в зависимостях — добавлен (`^5.9.1`, совместим с zod v4, проверено smoke-тестом на реальную ошибку валидации).
- **`erasableSyntaxOnly`** (флаг `tsconfig.app.json`) запрещает parameter properties в конструкторе (`constructor(public readonly x: T)`) — генерируют рантайм-код, не чисто стираемый синтаксис. `ApiError` в `api-client.ts` переписан с явными полями и присваиванием в теле конструктора.
- **`shadcn` CLI-пакет** после `init` попал в `dependencies` — перенесён в `devDependencies` (это инструмент сборки, не рантайм-код).
- **Health-check виджет Этапа 1**: не удалён, а перенесён в компактный угловой индикатор `components/DevHealthIndicator.tsx` — сохраняет живой сигнал доступности `/api` без доминирования над реальным UI.
- **Кастомный subagent `.claude/agents/ui-reviewer.md`** создан, но (как и MCP-серверы на Этапе 2) не стал вызываемым в той же сессии, где создан — требуется рестарт Claude Code. Тот же ревью прогнан вручную через `general-purpose`-агента с идентичными инструкциями; нашёл 2 мелкие проблемы (отсутствие `aria-describedby` у сообщений об ошибках формы, нетокенизированные цвета в `DevHealthIndicator`) — обе исправлены сразу.
- **`/stage-review 3`** (диф от `stage-2-done`) нашёл и исправил реальные проблемы в 2 итерациях на каждый заход:
  - Заход 1: пустой `title` отправлялся как `""` вместо `undefined` (порядок веток zod-union был неверным); необработанный `navigator.clipboard.writeText` мог дать unhandled rejection без уведомления пользователя.
  - Заход 2 (интеграция): `LinksController` возвращал Prisma-тип `Link` вместо контракта `shared-types` (несогласованно с паттерном `health.controller.ts`); `Link` в `shared-types` был объявлен независимо от реальной Prisma-модели (optional vs nullable поля) без структурной связи; `CreateLinkRequest`-валидация дублировалась в 3 независимых местах вместо единой zod-схемы, которую сам `CLAUDE.md` описывает как паттерн проекта («Define Zod schemas in packages/shared-types … Same schema = same validation logic everywhere»). Все три исправлены: контроллер кастует на границе (как в `health.controller.ts`), `Link` теперь `title: string | null`/`expiresAt: string | null` (реальная форма Prisma JSON), `createLinkRequestSchema` вынесена в `shared-types` и импортируется фронтендом вместо локальной копии; `zod` добавлен как реальная (не dev-) зависимость `packages/shared-types`.
- Все фиксы перепроверены вживую через `claude-in-chrome` и `psql` после чистого пересобора (`rm -rf dist && pnpm turbo run build type-check lint`) — 0 ошибок, 0 регрессий.

## Зависимости от предыдущих этапов

Этап 2: реальные `/links` (CRUD) и `/:code` (редирект) эндпоинты должны быть рабочими.
