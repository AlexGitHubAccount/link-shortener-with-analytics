# Этап 5: Аналитика — сбор кликов, UA-парсинг, графики

**Статус**: ⏳ Запланирован

## Цель этапа

Каждая ссылка получает страницу аналитики: график переходов по дням, топ источников (referrer), разбивка по типу устройства/браузеру/ОС. Данные собираются с реальных кликов по короткой ссылке.

## Темы Claude Code для практики

- **Agent teams** — фича достаточно крупная и естественно параллелится: одна ветка делает backend-агрегацию и UA-парсинг, другая — frontend-графики. Координируемые сессии под лидером с общим списком задач, обмен статусом между ветками.
- **`/code-review`** — после слияния обеих веток, перед тем как считать этап завершённым.

## Что реализуем

### Backend
- Модуль `analytics`, эндпоинт `GET /links/:id/analytics` (приватный, только владелец ссылки — использует `@CurrentUser()` из Этапа 4). Агрегация через Prisma `groupBy`/raw SQL:
  - `totalClicks` — общее число кликов.
  - `clicksByDay` — клики по дням за последние 30 дней (заполнение нулями дней без кликов).
  - `topReferrers` — топ-5 referrer по количеству кликов.
  - `deviceBreakdown` — количество кликов по `deviceType` (DESKTOP/MOBILE/TABLET/BOT/UNKNOWN).
- **User-Agent парсинг**: библиотека `ua-parser-js`, подключается в `redirect.controller.ts`/`analytics.service.ts::recordClick` (доработка заглушки из Этапа 2) — на каждый клик парсит `userAgentRaw` в `browser`, `os`, определяет `deviceType` (включая эвристику для ботов по regex на известные bot-строки).
- `LinkAnalytics` тип в `packages/shared-types` дорабатывается под реальную структуру ответа API (заготовка уже есть с Этапа 1).

### Frontend
- `features/analytics/useAnalytics.ts` — `useQuery(['analytics', linkId], ...)`.
- `features/analytics/ClicksChart.tsx` — `recharts` `LineChart`/`BarChart` по `clicksByDay`.
- `features/analytics/ReferrersTable.tsx` — таблица топ-referrer.
- `features/analytics/DeviceBreakdownChart.tsx` — `recharts` `PieChart` по `deviceBreakdown`.
- `routes/LinkAnalytics.tsx` — страница `/links/:id`, собирает все три компонента; ссылка на неё добавляется в `LinksList` (Этап 3) рядом с каждой ссылкой.

## Пошаговый план работ

1. Лидер-сессия формирует agent team с двумя параллельными задачами: backend-агрегация+UA-парсинг и frontend-графики.
2. **Backend-ветка**: подключить `ua-parser-js` в запись клика, реализовать `GET /links/:id/analytics` с полной агрегацией.
3. **Frontend-ветка** (параллельно): строить компоненты графиков на моке ответа, соответствующем типу `LinkAnalytics` из shared-types (не дожидаясь готовности backend-ветки).
4. Синхронизация: frontend переключается с мока на реальный эндпоинт.
5. `/code-review` по обоим направлениям после слияния.
6. Сквозная проверка: несколько переходов по короткой ссылке с разными `User-Agent` (через `curl -A`) → страница аналитики показывает корректную разбивку.
7. Прогнать `/stage-review 5` (см. `docs/plan.md`) — только после чистого результата статус меняется на ✅. Обязательно выполнить полную синхронизацию документации («Обязательное обновление документации после этапа» в `docs/plan.md`).

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `apps/api/src/analytics/*` | Агрегация кликов |
| `apps/api/src/redirect/redirect.controller.ts` | Доработка — вызов UA-парсинга при клике |
| `apps/web/src/features/analytics/*` | Хуки и графики |
| `apps/web/src/routes/LinkAnalytics.tsx` | Страница аналитики ссылки |
| `packages/shared-types/src/index.ts` | Финальный `LinkAnalytics` |

## Верификация

- `curl -A "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" localhost:4000/<code>` несколько раз с разными UA-строками → `GET /links/:id/analytics` отражает верную разбивку по `deviceType`/`browser`/`os`.
- Страница `/links/:id` в браузере рисует все три графика/таблицы с реальными данными.
- Ссылка на аналитику видна и кликабельна из списка ссылок на Dashboard.

## Зависимости от предыдущих этапов

Этап 2 (redirect и фиксация кликов), Этап 4 (auth — аналитика приватна, доступна только владельцу ссылки).
