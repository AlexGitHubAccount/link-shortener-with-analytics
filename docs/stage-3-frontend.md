# Этап 3: Frontend — Dashboard, формы, список ссылок

**Статус**: ⏳ Запланирован

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
11. Прогнать `/stage-review 3` (см. `docs/plan.md`) — только после чистого результата статус меняется на ✅.

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `apps/web/src/lib/api-client.ts` | Обёртка над `fetch` |
| `apps/web/src/lib/query-client.ts` | Инстанс TanStack Query |
| `apps/web/src/features/links/*` | Хуки и компоненты работы со ссылками |
| `apps/web/src/routes/Dashboard.tsx`, `NotFound.tsx` | Страницы |
| `apps/web/src/App.tsx` | Роутинг вместо health-check заглушки |
| `apps/web/src/components/ui/*` | shadcn-компоненты |
| `.claude/agents/ui-reviewer.md` | Кастомный subagent |

## Верификация

- `pnpm dev` — оба сервера работают.
- Через `claude-in-chrome`: создание ссылки через форму → появляется в списке → клик по короткому URL приводит на `originalUrl`.
- `pnpm --filter web lint` — чист.
- Консоль браузера (`read_console_messages`) не содержит ошибок React/сети.

## Зависимости от предыдущих этапов

Этап 2: реальные `/links` (CRUD) и `/:code` (редирект) эндпоинты должны быть рабочими.
