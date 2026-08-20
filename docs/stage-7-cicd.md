# Этап 7: CI/CD — GitHub Actions

**Статус**: ⏳ Запланирован

## Цель этапа

Автоматическая проверка каждого push/PR: lint, type-check, тесты, сборка. Ничего не мержится в main, пока чеки не зелёные.

## Темы Claude Code для практики

- **MCP GitHub** — создание/просмотр PR, чтение статусов чеков прямо из чата, без переключения в браузер.
- **Scheduled/cron-агенты** (опционально) — например, еженедельный агент, прогоняющий `pnpm audit`/проверку устаревших зависимостей и открывающий issue при находках.

## Что реализуем

- `.github/workflows/ci.yml` — триггеры `push`/`pull_request`; матрица задач по `api`/`web`: `pnpm install` (с кэшем pnpm store), `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build`. Опционально — Turborepo remote cache (Vercel remote cache token) для ускорения повторных прогонов на CI.
- `.github/workflows/e2e.yml` — отдельный job с PostgreSQL как GitHub Actions `services:`, прогон Playwright E2E из Этапа 6.
- Branch protection на `main` (настраивается вручную в GitHub UI — не через Claude Code; шаги фиксируются в этом файле как инструкция пользователю).
- Опционально: `.github/workflows/deploy.yml` — заготовка автодеплоя (например, Railway/Fly.io для `api`, Vercel/Netlify для `web`) — конкретная платформа решается пользователем на момент реализации этапа.

## Пошаговый план работ

1. Через MCP GitHub проверить текущее состояние репозитория/веток.
2. Написать `ci.yml` с job'ами lint/type-check/test/build (без E2E — они дороже и идут отдельным job'ом).
3. Добавить PostgreSQL как `services:` в `e2e.yml`, прогнать Playwright-тесты из Этапа 6.
4. Запушить, через MCP GitHub проверить прогон и статусы чеков на реальном PR.
5. Настроить branch protection в GitHub UI (ручной шаг, описать в файле).
6. При желании — scheduled-агент для еженедельного dependency audit.
7. Обновить `README.md` бейджем статуса CI.

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `.github/workflows/ci.yml` | Lint/type-check/test/build на каждый push/PR |
| `.github/workflows/e2e.yml` | E2E с поднятым Postgres |
| `.github/workflows/deploy.yml` | (опционально) автодеплой |
| `README.md` | Бейдж статуса CI |

## Верификация

- Открытый PR в GitHub показывает все чеки зелёными.
- Специально сломанный тест в тестовой ветке — CI падает и блокирует мерж (branch protection работает).
- MCP GitHub из чата показывает актуальные статусы проверок.

## Зависимости от предыдущих этапов

Этап 6 — должны существовать тесты, которые CI будет запускать.
