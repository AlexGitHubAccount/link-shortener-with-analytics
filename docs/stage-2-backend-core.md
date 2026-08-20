# Этап 2: Backend Core — Links CRUD + Redirect

**Статус**: ⏳ Запланирован

## Цель этапа

Полнофункциональные `/links` (CRUD) и публичный `GET /:code` редирект с фиксацией клика. К концу этапа приложение умеет создавать короткие ссылки и реально по ним редиректить, записывая сырые данные о переходе для будущей аналитики.

## Темы Claude Code для практики

- **Custom slash-команда** `/gen-nest-crud` — генерирует Nest-модуль (controller/service/dto/module) по паттерну проекта, чтобы не переписывать boilerplate вручную для каждого следующего модуля.
- **Skills** — переиспользуемый навык для CRUD-паттерна NestJS + Prisma, применимый не только к `links`, но и к будущим модулям.
- **MCP-сервер PostgreSQL** — инспекция БД прямо из чата Claude Code (посмотреть таблицы, данные, проверить, что клик записался) без переключения в `psql`/Prisma Studio.
- **MCP Context7** — актуальная документация по версии библиотек прямо в контексте (Prisma v6 API, NestJS-паттерны, `class-validator` декораторы). Подключается один раз здесь и используется до конца проекта — везде, где нужен точный синтаксис быстро меняющейся библиотеки, а не то, что модель «помнит» из обучения (ровно эта причина стояла за граблями с Prisma v7 на Этапе 1 — Context7 мог бы сразу показать актуальный конфиг).
- **MCP Docker** — инспекция контейнера PostgreSQL (статус, логи) напрямую из чата вместо ручных `docker ps`/`docker logs`; полезно при отладке проблем подключения БД, которые неизбежно будут возникать при разработке CRUD.

## Что реализуем

### Модуль `links` (приватный CRUD)
На этом этапе auth ещё нет (Этап 4), поэтому эндпоинты временно публичные — с явным `// TODO(stage-4): auth guard` в коде, чтобы не забыть.

**⚠️ Важный технический момент**: `Link.userId` в schema — обязательное поле с FK на `User` (не `String?`), т.е. каждая ссылка обязана принадлежать какому-то пользователю уже сейчас, до появления реального логина. Решение: при старте модуля (миграция данных / seed-скрипт `apps/api/prisma/seed.ts`, либо lazy-создание при первом запросе) создаётся один служебный пользователь-заглушка — например `googleId: 'stage2-placeholder'`, `email: 'placeholder@local'` — и все ссылки, создаваемые до Этапа 4, привязываются к нему через захардкоженный `userId` в `LinksService`. На Этапе 4 этот хардкод заменяется на `@CurrentUser()`; ссылки, созданные заглушкой, останутся у неё же (для учебного проекта это не проблема — не переносим существующие данные между пользователями).

- DTO: `CreateLinkDto` (`originalUrl: string` — URL-валидация, `customCode?: string` — 3–20 символов, alphanumeric, `title?: string`), `UpdateLinkDto` (`title?`, `isActive?`, `expiresAt?`) — в `apps/api/src/links/dto/`, зеркалят типы из `packages/shared-types`.
- `POST /links` — создание. Если `customCode` не передан — генерация через `nanoid` (7 символов, URL-safe алфавит), `isCustomAlias: false`; если передан — используется как есть, `isCustomAlias: true`. Проверка уникальности `shortCode` перед вставкой (обработать race condition на уникальном индексе — `try/catch` на Prisma `P2002`, а не только предварительный `findUnique`).
- `GET /links` — список с пагинацией (`?page=&limit=`, дефолт `limit=20`).
- `GET /links/:id` — одна ссылка по id.
- `PATCH /links/:id` — обновление (`title`, `isActive`, `expiresAt`).
- `DELETE /links/:id` — удаление (или soft-delete через `isActive=false` — решить на этапе реализации, склоняемся к soft-delete, т.к. историчные клики должны оставаться консистентными).
- Файлы: `links.controller.ts`, `links.service.ts`, `links.module.ts`, `dto/create-link.dto.ts`, `dto/update-link.dto.ts`.

### Модуль `redirect` (публичный, без auth guard)
Отдельно от `links` намеренно — высокочастотный путь, не должен зависеть от будущих auth-проверок.

- `GET /:code` — резолв `shortCode` → `originalUrl`, HTTP 302 редирект.
- Асинхронная фиксация клика: `referrer` (заголовок `Referer`), `userAgentRaw` (заголовок `User-Agent`) — записываются в `Click` **не блокируя редирект** (fire-and-forget вызов `analyticsService.recordClick(...)`, без `await` в основном потоке ответа).
- Обработка ошибок: ссылка не найдена → `404`; `isActive=false` или `expiresAt` в прошлом → `410 Gone`.

### `analytics` — заготовка на этом этапе
- `analytics.service.ts`: метод `recordClick(linkId, { referrer, userAgentRaw })` — просто пишет запись в `Click` без разбора `browser`/`os`/`deviceType` (это Этап 5, UA-парсинг). Значения по умолчанию `deviceType: UNKNOWN`.

### `packages/shared-types`
- `Link` и `CreateLinkRequest` заменяются с placeholder-версий на реальные, использующиеся и в DTO (через ручное дублирование полей — `class-validator` и `zod` разные раннеры, полной унификации на TS-уровне без доп. тулинга нет).

## Пошаговый план работ

1. Добавить MCP-серверы: PostgreSQL (`claude mcp add` с connection string из `.env`, проверить видимость таблиц `User`/`Link`/`Click`), Context7 (`claude mcp add context7 -- npx -y @upstash/context7-mcp`), Docker (проверить, что виден контейнер `link-shortener-db`).
2. Seed-скрипт/lazy-создание служебного пользователя-заглушки (см. врезку выше) — без этого `POST /links` упадёт на FK-constraint.
3. Написать skill/slash-команду `/gen-nest-crud` — шаблон Nest CRUD-модуля, соответствующий уже принятым в проекте паттернам (`PrismaService`-инъекция, DTO с `class-validator`).
4. Сгенерировать модуль `links` через эту команду, доработать вручную (генерация `shortCode`, пагинация, привязка к seed-пользователю).
5. Реализовать модуль `redirect` (резолв + fire-and-forget запись клика).
6. Реализовать заготовку `analytics.service.ts::recordClick`.
7. Обновить `packages/shared-types` — реальные `Link`/`CreateLinkRequest`.
8. Прогнать существующие миграции (schema с Этапа 1 уже покрывает нужные таблицы, новых миграций не требуется, если не менялась схема).
9. `curl`-тесты всех эндпоинтов CRUD + редиректа.
10. Через MCP Postgres проверить, что клик реально попал в таблицу `Click`.
11. Обновить таблицу статусов в `docs/plan.md`.

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `apps/api/prisma/seed.ts` (или lazy-создание в `LinksService`) | Служебный пользователь-заглушка для `userId` до Этапа 4 |
| `apps/api/src/links/*` | CRUD-модуль ссылок |
| `apps/api/src/redirect/*` | Публичный редирект-контроллер |
| `apps/api/src/analytics/analytics.service.ts` | Заглушка записи клика |
| `packages/shared-types/src/index.ts` | Реальные `Link`/`CreateLinkRequest` |
| `.claude/commands/gen-nest-crud.md` или `.claude/skills/nest-crud/` | Slash-команда/skill генерации CRUD |
| MCP-конфиг (`.mcp.json` или `claude mcp add`) | Подключение PostgreSQL, Context7, Docker |

## Верификация

- `curl -X POST localhost:4000/links -d '{"originalUrl":"https://example.com"}' -H 'Content-Type: application/json'` → `201` с телом, содержащим сгенерированный `shortCode`.
- `curl -i localhost:4000/<shortCode>` → `302` с заголовком `Location: https://example.com`.
- `curl localhost:4000/links` → массив созданных ссылок.
- `curl localhost:4000/does-not-exist` → `404`.
- Через MCP Postgres: `SELECT * FROM "Click"` показывает запись с корректным `linkId` и `referrer`/`userAgentRaw`.

## Зависимости от предыдущих этапов

Этап 1 завершён: Prisma-схема и `PrismaService` рабочие, backend стартует без ошибок.
