---
description: Генерирует NestJS CRUD-модуль (controller/service/module/dto) по паттернам этого проекта, поверх существующей Prisma-модели
---

# /gen-nest-crud

Генерирует полный CRUD-модуль в `apps/api/src/<resource>/` по конвенциям, уже принятым в этом проекте (см. `prisma/prisma.service.ts`, `health/health.controller.ts` как референс структуры).

## Аргументы

`$ARGUMENTS` — имя ресурса в единственном числе (например `link`) и опционально список полей DTO через запятую. Если аргумент не передан или неполный — спросить пользователя явно: (1) имя Prisma-модели, под которую генерируем CRUD, (2) какие поля идут в create-DTO и какие в update-DTO, (3) нужна ли пагинация в списке, (4) delete — soft (`isActive=false`) или hard.

## Что сгенерировать

Для ресурса `<resource>` (множественное число `<resources>` для путей):

1. **`<resource>/dto/create-<resource>.dto.ts`** — класс с `class-validator` декораторами (`@IsString()`, `@IsOptional()`, `@IsUrl()`, `@IsBoolean()` и т.д. — выбрать по типу поля), без `id`/`createdAt`/`updatedAt`/связей.
2. **`<resource>/dto/update-<resource>.dto.ts`** — как правило подмножество create-DTO с `@IsOptional()` на всех полях (не через `PartialType`, чтобы не тянуть лишнюю зависимость `@nestjs/mapped-types`, если её ещё нет в проекте — писать явно).
3. **`<resource>/<resource>.service.ts`**:
   - Инжектит `PrismaService` через конструктор (паттерн как в `prisma.service.ts`).
   - `create(dto)`, `findAll(page?, limit?)` (пагинация через `skip`/`take`, дефолт `limit=20`), `findOne(id)` (кидает `NotFoundException`, если нет), `update(id, dto)`, `remove(id)`.
   - **Важно**: методы типизируются возвращаемым типом из `@prisma/client` (например `Promise<Link>` из Prisma), а НЕ типом с зеркальной формой из `packages/shared-types` — там даты `string` (пост-сериализация), а Prisma отдаёт `Date`. Смешивать эти два типа в одном возвращаемом значении — источник TS-ошибок именно того рода, что ловит `integration-reviewer` в `/stage-review`.
   - Если у модели есть уникальное поле, генерируемое на лету (как `shortCode` у `Link`) — не полагаться только на предварительный `findUnique`, обязательно обернуть `create` в `try/catch` на Prisma-код `P2002` (race condition на уникальном индексе).
4. **`<resource>/<resource>.controller.ts`**: `@Controller('<resources>')`, эндпоинты `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`, с `@Body()`/`@Param()`/`@Query()` и DTO из п.1–2.
5. **`<resource>/<resource>.module.ts`**: обновить существующий файл-заготовку (не создавать новый) — добавить `controllers`/`providers`, экспортировать сервис, если он понадобится другим модулям.

## После генерации

Явно перечислить пользователю, что было создано/изменено, и какие места требуют ручной доработки под конкретный домен (специфика полей, бизнес-правила типа soft-delete, race condition на уникальных кодах) — команда даёт boilerplate, а не финальную реализацию.
