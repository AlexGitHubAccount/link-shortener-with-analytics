# Этап 2: Backend Core — Links CRUD + Redirect

**Статус**: ✅ Завершён (2026-08-21)

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
11. Прогнать `/stage-review 2` (см. «Процесс ревью после каждого этапа» в `docs/plan.md`) — только после чистого результата статус меняется на ✅ и обновляется таблица в `docs/plan.md`.

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

## Как выполнялось по факту

Реализация в целом следовала плану, с несколькими уточнениями по ходу:

- **MCP-серверы**: PostgreSQL (`@modelcontextprotocol/server-postgres`) и Context7 (`@upstash/context7-mcp`) — официальные/проверенные пакеты, подключены без вопросов. Для Docker MCP официального пакета от Anthropic/Docker нет — пользователю явно предложен выбор между community-пакетом (`docker-mcp`, доступ к Docker-сокету) и пропуском; выбран community-пакет. Все три добавлены через `claude mcp add`, подтверждены `claude mcp list` (✔ Connected), но инструменты стали доступны только после следующего рестарта Claude Code — MCP, добавленные командой посреди сессии, не подключаются "на лету" в ту же сессию.
- **`nanoid`**: закреплена версия `^3.3.8` осознанно, не последняя (`6.x`). Начиная с v4, `nanoid` — ESM-only, а backend компилируется в CommonJS (`module: nodenext` без `"type": "module"` в `package.json`) — та же категория проблемы, что Prisma v7 на Этапе 1. v3 остаётся dual CJS/ESM и не ломает сборку.
- **`PrismaService`** (Этап 1) оказался нерабочим хаком: временная runtime-детекция v6/v7 из середины Этапа 1 типизировала весь доступ к Prisma как `any`, полностью гасив генерируемые типы по всему приложению. Переписан на стандартный NestJS-паттерн `class PrismaService extends PrismaClient` — раз проект осознанно закреплён на v6 (см. `docs/plan.md`), никакой runtime-детекции не нужно. Заодно удалён мёртвый `apps/api/prisma/prisma.config.ts` (артефакт того же эксперимента с v7, ничем не используется на v6).
- **Порядок роутов**: `RedirectController` вешает `GET /:code` в корне — однословный wildcard, который в Express/Nest матчится в порядке регистрации модулей, а не по специфичности. Явно закреплён порядок импортов в `app.module.ts` (модули с топ-левел `GET`-роутами — до `RedirectModule`) и добавлен reserved-word guard на `customCode` (`links`, `health`, `redirect`, ...), чтобы пользователь не мог создать алиас, коллизирующий с реальным роутом.
- **Custom slash-команда** `.claude/commands/gen-nest-crud.md` — создана как шаблон, применена «руками» к ресурсу `links` (нет способа вызвать только что созданную слэш-команду изнутри текущего хода), пригодна для повторного использования на будущих модулях.

## Прогон `/stage-review 2` (2026-08-21)

Первый реальный прогон нового Workflow-механизма `/stage-review` на нетривиальном этапе (Этап 1 тестировался только с Заходом 2, т.к. N=1). Заход 1 (диф от `stage-1-done`, параллельно code+security роли) потребовал **3 итерации**:

1. **Итерация 1** — 3 находки: NaN в пагинации при нечисловых `page`/`limit` (2 связанных места в контроллере/сервисе) + отсутствие auth-guard на `/links` (security). Фиксер починил первые два, **осознанно не стал чинить третье** — верно распознал явное архитектурное решение проекта (auth запланирован на Этап 4, см. `TODO(stage-4)` в коде и этот документ) и явно доложил об этом вместо того, чтобы городить временный auth.
2. **Итерация 2** — 1 находка: dead code в retry-loop генерации short-code (после исчерпания попыток наружу утекала сырая ошибка Prisma вместо дружелюбного `InternalServerErrorException`). Починено.
3. **Итерация 3** — 1 низкоприоритетная находка: `page`/`limit` пропускали дробные значения (`?page=1.5`) из-за `Number.isFinite` вместо `Number.isInteger`. Так как это была последняя (3-я) итерация, workflow **не стал фиксить автоматически** — по правилам скилла, дошёл до лимита и остановился с `status: 'pass1-dirty'`, Заход 2 не запускался.

Находка итерации 3 исправлена вручную в основной сессии (тривиальный фикс, `parsePositiveInt()` с `Number.isInteger`), после чего `/stage-review 2` перезапущен с самого начала. Второй прогон: **Заход 1 и Заход 2 оба чисты с первой итерации** — 3 агента, 0 находок.

Побочно найден и устранён баг самого dev-окружения, не связанный с кодом: `nest start --watch`-процесс перестал пересобирать `dist/` после нескольких подряд коммитов от fixer-агентов workflow, из-за чего ручная верификация одно время попадала на устаревшую сборку (ложный `500` на `?page=abc`). Устранено чистым перезапуском (`rm -rf dist && pnpm dev`).

## Зависимости от предыдущих этапов

Этап 1 завершён: Prisma-схема и `PrismaService` рабочие, backend стартует без ошибок.
