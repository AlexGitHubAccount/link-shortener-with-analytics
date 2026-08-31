# CLAUDE.md: link-shortener-with-analytics

**Назначение**: учебный монорепозиторий для освоения возможностей Claude Code на примере сервиса сокращения ссылок с аналитикой.

## Стек и архитектура

### Структура монорепозитория
- **Пакетный менеджер**: pnpm (через corepack)
- **Инструмент монорепо**: Turborepo
- **Workspace**: `pnpm-workspace.yaml` определяет `apps/*` и `packages/*`

```
link-shortener/
├── apps/
│   ├── api/       # NestJS backend, TypeScript strict mode
│   └── web/       # Vite + React frontend, TypeScript strict mode
├── packages/
│   └── shared-types/    # Общие TS-типы и DTO (zod-схемы + class-validator)
```

`packages/eslint-config` и `packages/tsconfig` (общие конфиги на все workspace) — возможное будущее расширение, пока не заведены: каждому приложению пока хватает своего lint/tsconfig.

### Backend (apps/api)
- **Фреймворк**: NestJS (последняя версия)
- **ORM**: Prisma (PostgreSQL)
- **База данных**: PostgreSQL 16 (в docker-compose)
- **Схема**: `apps/api/prisma/schema.prisma` — единственный источник истины по моделям данных
- **Модули**: `prisma` (глобальный), `health`, `auth` (Google OAuth + JWT, с server-side отзывом токена), `users`, `links`, `redirect`, `analytics`
- **Порт**: 4000 (через `process.env.PORT ?? 4000`)
- **CORS**: список origin читается из `ALLOWED_ORIGINS` (env, через запятую), по умолчанию — те же два localhost-адреса для dev. Захардкоженного списка больше нет — на реальном домене без этой переменной API просто отказывал бы фронтенду.
- **Graceful shutdown**: `app.enableShutdownHooks()` в `main.ts` — без этого `PrismaService.onModuleDestroy()` никогда не срабатывал на `SIGTERM`, соединения к БД не закрывались аккуратно при рестарте контейнера.
- **Валидация env на старте**: `apps/api/src/config/env.validation.ts` (Joi-схема, подключена через `ConfigModule.forRoot({ validate })`) — некорректная/пропущенная переменная валит приложение сразу, с конкретным сообщением, а не позже как невнятная ошибка в рантайме. `JWT_SECRET` туда намеренно не входит — им отдельно и раньше владеет `jwt-secret.ts` со своим более полезным сообщением, дублировать/конфликтовать с ним не нужно.

Ключевые зависимости:
- `@nestjs/config` — управление окружением
- `@nestjs/terminus` — health-чеки
- `@prisma/client` / `prisma` — **закреплены на v6** (`^6.0.0`), не v7. v7 вынесла `datasource.url` из `schema.prisma` в отдельный `prisma.config.ts` и сломала `prisma migrate dev` без него — лишняя сложность для этого проекта. Не обновлять без осознанной причины.
- `class-validator` / `class-transformer` — обязательные peer-зависимости для Nest `ValidationPipe` (используется в `main.ts`); не ставятся скаффолдом Nest CLI по умолчанию, добавлять явно.
- `@nestjs/axios` — HTTP-клиент
- `helmet` — security-заголовки ответа (`app.use(helmet())` в `main.ts`); CSP отключён вне продакшена, иначе ломает Swagger UI на `/api/docs`.
- `@nestjs/throttler` — rate limiting; зарегистрирован глобально (`ThrottlerModule.forRoot`), но НЕ как глобальный guard — применяется точечно через `@UseGuards(ThrottlerGuard)` на `RedirectController` (единственный эндпоинт без `JwtAuthGuard`) и на `LinksController.create` (более жёсткий лимит — сама точка злоупотребления, не только клик по уже созданной ссылке), чтобы не лимитировать остальной авторизованный dashboard-трафик.
- `joi` — валидация env на старте (см. выше).

### Frontend (apps/web)
- **Фреймворк**: Vite + React 19 + TypeScript
- **Роутинг**: react-router-dom v7
- **Состояние и данные**:
  - Серверное состояние: `@tanstack/react-query` v5 (TanStack Query)
  - Клиентское состояние: `zustand` (только auth/UI-флаги, без данных)
- **Формы**: `react-hook-form` + `zod` (валидация схемой)
- **Стили**: Tailwind CSS v4 + PostCSS
- **UI-компоненты**: shadcn/ui (база Radix UI, пресет «Nova» — настроено через `pnpm dlx shadcn@latest init -b radix -p nova`)
- **Графики**: `recharts` (визуализация аналитики)
- **Порт**: 5173 (дефолт Vite dev-сервера)
- **Тестирование**: Vitest + React Testing Library

Ключевые зависимости:
- `react-router-dom` — клиентский роутинг
- `@tanstack/react-query` — серверное состояние и кэширование
- `react-hook-form` + `zod` — валидация форм (тот же zod, что и в backend DTO)
- `zustand` — лёгкое глобальное состояние
- `tailwindcss` + `postcss` + `autoprefixer` — стили
- `recharts` — графики для дашборда аналитики
- `vitest` + `@testing-library/react` — unit- и component-тесты

### Docker

**Dev** (`docker-compose.yml`): только PostgreSQL 16 (alpine), именованный volume `pgdata`, health check `pg_isready` каждые 5с. Backend/frontend в dev без контейнеров — запускаются нативно через `pnpm dev`, чтобы сохранить HMR.

**Production-образы** (`apps/api/Dockerfile`, `apps/web/Dockerfile`) — реально собраны и прогнаны сквозь друг друга при добавлении, не только написаны на бумаге:
- Контекст сборки для ОБОИХ — **корень репозитория**, не `apps/api`/`apps/web` — pnpm workspace нужен целиком (`pnpm-workspace.yaml`, `pnpm-lock.yaml`, манифест целевого пакета + `packages/shared-types`, от которого оба зависят). Обязателен корневой `.dockerignore` — см. грабли ниже.
  ```bash
  docker build -f apps/api/Dockerfile -t link-shortener-api .
  docker build -f apps/web/Dockerfile -t link-shortener-web .
  ```
- `apps/api/Dockerfile`: multi-stage (deps → build shared-types + `prisma generate` + `nest build` → runtime). Runtime-стадия копирует ВЕСЬ `node_modules` из build-стадии целиком (включая devDependencies) — сознательный выбор, не недосмотр: попытка вручную собрать «только prod-зависимости», копируя отдельные пути из pnpm-хранилища `.pnpm`, на практике ломает резолвинг модулей (symlink'и pnpm ведут в контент-адресуемое хранилище, копирование части путей рвёт их) — рабочая корректность важнее размера образа на этом масштабе проекта.
- `apps/web/Dockerfile`: multi-stage (deps → build shared-types + `vite build` → `nginx:1.27-alpine` со статикой). `apps/web/nginx.conf.template` проксирует `/api/*` на бэкенд (`${API_UPSTREAM_URL}`, дефолт `http://api:4000` — под docker-compose/k8s service DNS), с тем же rewrite-правилом, что и dev-прокси Vite (`vite.config.ts`) — срезает префикс `/api` перед пробросом. Публичный редирект (`GET /:code`) сознательно НЕ проксируется — как и в dev, это отдельный, прямой адрес backend'а, не через фронтенд.
- Оба образа реально собраны, запущены вместе на одной Docker-сети (веб → `api:4000` по имени сервиса) и проверены: статика отдаётся, `/api/health` доходит до реальной Postgres через прокси, graceful shutdown (`docker stop`) завершается с exit code 0.
- **CD (реальный деплой куда-то) пока не настроен** — нужен выбор платформы (Fly.io/Railway/VPS/что угодно), это решение пользователя, не техническая задача.

## Процесс разработки

### Первоначальная настройка
```bash
# Активировать pnpm через corepack
corepack enable && corepack prepare pnpm@latest --activate

# Установить все зависимости (корневой workspace + все apps/packages)
pnpm install

# Поднять контейнер PostgreSQL
pnpm docker:up
# или: docker compose up -d postgres

# Инициализировать схему БД и прогнать Prisma-миграции
pnpm --filter api exec prisma migrate dev --name init
```

### Запуск dev-серверов
```bash
# Терминал 1: параллельно поднять frontend (Vite :5173) и backend (Nest :4000)
pnpm dev

# Терминал 2 (опционально): смотреть БД через Prisma Studio
pnpm --filter api exec prisma studio
```

### Сборка для продакшена
```bash
# Собрать все apps и packages
pnpm build

# Линт всех apps и packages
pnpm lint
```

### База данных

#### Миграции
```bash
# Создать новую миграцию после изменений schema.prisma
pnpm --filter api exec prisma migrate dev --name <migration_name>

# Применить существующие миграции (CI/деплой)
pnpm --filter api exec prisma migrate deploy

# Посмотреть базу в веб-интерфейсе
pnpm --filter api exec prisma studio
```

#### Схема
- Расположение: `apps/api/prisma/schema.prisma`
- Модели: User, Link, Click (с enum'ом Click.DeviceType), RevokedToken
- Каждая сущность схемы — единственный источник истины для:
  - типов Prisma Client (FE/BE используют `@prisma/client` или `@link-shortener/shared-types`)
  - миграций БД
  - будущего экспорта ORM-независимых типов в shared-types

#### Отзыв JWT (server-side logout)
`POST /auth/logout` (`AuthController.logout`, за `JwtAuthGuard`) — вставляет `jti` текущего токена в `RevokedToken`; `JwtStrategy.validate()` проверяет эту таблицу на КАЖДОМ аутентифицированном запросе, не только при входе. До этого «выход» был чисто клиентским (удаление токена из `localStorage`) — украденный/утёкший токен оставался рабочим все `JWT_EXPIRES_IN` (7 дней по умолчанию) независимо от того, что делал легитимный пользователь. Токены, выпущенные до появления `jti` (обратная совместимость), просто пропускают проверку отзыва — не ошибка, доживают до истечения по своему исходному TTL. Устаревшие строки `RevokedToken` подчищаются лениво при каждом реальном логауте (не отдельным cron-джобом — при таком масштабе не нужно).

### Переменные окружения

#### Корневой `.env` (креды docker-compose, в .gitignore)
```
POSTGRES_USER=linkshortener
POSTGRES_PASSWORD=linkshortener
POSTGRES_DB=linkshortener
```

#### Backend `apps/api/.env` (подключение к БД + конфиг приложения, в .gitignore)
```
DATABASE_URL="postgresql://linkshortener:linkshortener@localhost:5432/linkshortener"
PORT=4000
# Список origin для CORS через запятую — по умолчанию localhost, на реальном деплое указать
# настоящий домен фронтенда:
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

#### Frontend
- `.env` для dev не нужен — `vite.config.ts` проксирует запросы `/api/*` на `http://localhost:4000` (префикс срезается перед проксированием), браузер общается только с `:5173`.
- Переменные окружения для build-time конфига (например, `VITE_API_URL`) — в `apps/web/.env`, если/когда понадобятся.

### MCP-серверы

MCP подключает Claude Code к внешним системам напрямую, вместо того чтобы гадать по выводу shell-команд. Пять из шести закоммичены в `.mcp.json` — свежий клон получает их автоматически (Claude Code спросит разрешение подключить при первом запуске в этой директории). `claude-in-chrome` — расширение браузера, не MCP-сервер, в `.mcp.json` не попадает в принципе. Semgrep — единственное исключение, см. отдельно ниже таблицы.

| MCP | Что делает | Нужен аккаунт/ключ? |
|---|---|---|
| **PostgreSQL** | Инспекция БД (таблицы, данные, запросы) прямо из чата | Нет — коннект-строка захардкожена в `.mcp.json`, но это те же дефолтные dev-креды (`linkshortener`/`linkshortener`), что и в шаблоне `.env` выше в этом файле — не секрет |
| **Context7** | Актуальная документация/примеры по версии используемой библиотеки вместо возможно устаревших знаний модели | Нет (опционально ключ для более высоких лимитов) |
| **Docker** | Инспекция контейнеров/логов/образов без ручных `docker ps`/`docker logs` | Нет — локальный Docker |
| **claude-in-chrome** | Визуальное тестирование UI в реальном браузере | Нет — расширение Chrome, настраивается отдельно от `.mcp.json` |
| **Playwright** | Управление браузером для E2E | Нет — `npx @playwright/mcp` |
| **GitHub** | Публикация репозитория, PR, статусы CI прямо из чата | Да — локальный `ghcr.io/github/github-mcp-server` со встроенным OAuth (браузер откроется при первом использовании) |

**Semgrep не в `.mcp.json`** — его конфиг требует абсолютный host-путь текущего чекаута в `docker run -v` (у каждого разработчика свой), а автоматический конвейер (`.claude/agents/security-reviewer.md`, `backend-reviewer.md`) и так не использует MCP-инструменты Semgrep — они гоняют `docker run ... semgrep scan` напрямую через Bash (см. Troubleshooting ниже, почему: `uvx`/`pip` недоступны в этом окружении для официального пути `semgrep-mcp`). MCP-сервер Semgrep нужен только для интерактивных `mcp__semgrep__*` инструментов в чате — если хотите их, добавить в `.mcp.json` локально:
```json
"semgrep": {
  "type": "stdio",
  "command": "docker",
  "args": ["run", "-i", "--rm", "-v", "<абсолютный путь к этому чекауту>:/src", "semgrep/semgrep", "semgrep", "mcp"]
}
```

### Скрипты (команды pnpm)

**Корневой workspace** (`pnpm` = запуск во всех apps/packages):
- `pnpm dev` — запустить все `dev`-скрипты параллельно (постоянный процесс, без кэша)
- `pnpm build` — собрать все apps/packages с учётом зависимостей (Turborepo)
- `pnpm lint` — линт всех apps/packages
- `pnpm type-check` — проверка типов TypeScript во всех apps
- `pnpm test` — прогнать все тесты
- `pnpm docker:up` — поднять контейнер PostgreSQL
- `pnpm docker:down` — остановить и удалить контейнер PostgreSQL
- `pnpm docker:logs` — смотреть логи PostgreSQL

**Backend** (`pnpm --filter api`):
- `pnpm --filter api dev` — запустить Nest dev-сервер с HMR (:4000)
- `pnpm --filter api build` — собрать Nest (tsc + swc)
- `pnpm --filter api exec prisma migrate dev --name <name>` — создать и применить миграцию
- `pnpm --filter api exec prisma studio` — открыть Prisma Studio

**Frontend** (`pnpm --filter web`):
- `pnpm --filter web dev` — запустить Vite dev-сервер (:5173)
- `pnpm --filter web build` — собрать Vite-бандл (dist/)
- `pnpm --filter web test` — прогнать unit-тесты Vitest
- `pnpm --filter web lint` — линт (по умолчанию oxlint)

## Конвенции и паттерны кода

### TypeScript
- **Strict mode**: включён во всех apps и packages (`"strict": true` в tsconfig.json)
- **Никакого `any`**: использовать unknown + type guards или нормальные типы
- **Декораторы**: NestJS активно использует декораторы (`@Module`, `@Service`, `@Controller` и т.д.)

### Организация файлов

**Backend** (apps/api/src/):
```
auth/             # JWT & Google OAuth стратегия, guards, декораторы
users/            # CRUD пользователей, профиль
links/            # CRUD ссылок (create, read, update, delete)
redirect/         # Публичный GET /:code эндпоинт, фиксация кликов
analytics/        # Агрегация кликов, эндпоинты аналитики
prisma/           # Глобальный PrismaService и PrismaModule
health/           # GET /health (проверка готовности)
common/           # Общие фильтры, интерцепторы, pipes
```

**Frontend** (apps/web/src/):
```
routes/           # Компоненты страниц (Dashboard, LinkAnalytics, Login, NotFound)
components/ui/   # shadcn/ui и другие переиспользуемые компоненты (кнопки, карточки, диалоги, графики)
features/         # Логика по фичам (links, analytics, auth)
  ├── links/      # хук useLinks, CreateLinkForm, LinksList
  ├── analytics/  # компоненты графиков, хук useAnalytics
  └── auth/       # LoginPage, AuthCallback, AuthGuard
lib/              # Утилиты (api-client, query-client, хелперы)
stores/           # Zustand-сторы (только auth.store.ts, без сторов данных)
```

**Shared types** (packages/shared-types/src/):
```
index.ts          # Все экспортируемые типы: Link, Click, User, CreateLinkRequest, LinkAnalytics и т.д.
                  # Без реализации, только определения типов
```

### Паттерны и переиспользование

1. **DTO и валидация**:
   - Zod-схемы определяются в `packages/shared-types` (импортируются и в BE, и в FE)
   - Backend использует `class-validator` + Nest `ValidationPipe` для валидации запросов
   - Frontend использует Zod напрямую в `react-hook-form`
   - Одна схема = одна логика валидации везде

2. **Общение с API**:
   - Тонкая обёртка `apps/web/src/lib/api-client.ts` над `fetch` с обработкой ошибок
   - Хуки TanStack Query для серверного состояния (`useQuery`, `useMutation`)
   - Типы ответов приходят из `@link-shortener/shared-types`

3. **Глобальное состояние**:
   - Только auth-состояние (залогиненный пользователь, токен) → стор `zustand`
   - Всё остальное состояние → TanStack Query (серверное)
   - Никакого Redux, никакой перегрузки Context

4. **Формы**:
   - `react-hook-form` (лёгкий, производительный)
   - `zod` для валидации схемой (та же, что на backend)
   - Автогенерируемые сообщения об ошибках

### Тестирование

- **Backend**: Jest (дефолт для Nest, уже в сгенерированном package.json)
  - `apps/api/src/**/*.spec.ts`
  - Запуск: `pnpm --filter api test` · Покрытие: `pnpm --filter api test:cov` (порог 80% по всем 4 метрикам, задан в `jest.coverageThreshold` в `apps/api/package.json` — исключает `*.module.ts`/`main.ts`/`dto/*.ts`)

- **Frontend**: Vitest + React Testing Library
  - `apps/web/src/**/*.test.tsx`
  - Запуск: `pnpm --filter web test` · Покрытие: `pnpm --filter web test:cov` (порог 80%, `apps/web/vitest.config.ts`)
  - Файл настройки: `apps/web/src/test/setup.ts` (матчеры jest-dom + явная регистрация RTL `cleanup()` — `vitest.config.ts` выставляет `globals: false`, поэтому автоочистка RTL сама не регистрируется)

- **E2E**: Playwright, отдельный workspace `apps/e2e/` (не `apps/web/e2e/` — намеренно изолирован от конфига Vitest)
  - `apps/e2e/tests/*.spec.ts`
  - Запуск: `pnpm --filter e2e test:e2e` (нужны предварительно запущенные `pnpm dev` + `docker compose up -d postgres`)
  - `apps/e2e/tests/auth-helper.ts` логинится, выпуская настоящий JWT (тем же `JWT_SECRET`, что проверяет backend) и сея подходящую строку `User` через `psql` — реальный флоу Google OAuth не прогоняется (недоступен в этом окружении), но весь остальной код приложения (AuthCallback, `/auth/me`, guards) отрабатывает по-настоящему
  - Установка браузера: `npx playwright install chromium` (без `--with-deps` — требует `sudo`/`apt` для системных библиотек, доступных не в каждом окружении; браузер и без них нормально работает)
  - **a11y**: `@axe-core/playwright` на каждой ключевой странице (`/login`, Dashboard, LinkDetail/analytics) в `full-flow.spec.ts` — объективный, детерминированный скан WCAG2A/AA, только `serious`/`critical` impact (moderate/minor слишком часто спорные — например color-contrast на декоративных элементах — сделали бы проверку хрупкой). Дополняет, не заменяет ручное LLM-ревью `frontend-reviewer`, тот же принцип, что у `security-reviewer` + Semgrep.

## Отладка и типичные проблемы

### Проблемы pnpm
- **«Ignored build scripts»**: локально это только предупреждение (можно игнорировать), но `pnpm install --frozen-lockfile` на чистом CI-раннере считает это **жёсткой ошибкой** (exit 1) — подтверждено первым реальным прогоном GitHub Actions. Фикс — `allowBuilds: {packageName: true, ...}` в `pnpm-workspace.yaml` (реальный механизм pnpm 11 — не `onlyBuiltDependencies`, это имя для pnpm ≤10, в pnpm 11 молча игнорируется без ошибки). Если увидите, что pnpm сам вставил в этот файл битый блок `allowBuilds:` с буквальными плейсхолдерами `"set this to true or false"` — это pnpm пытается спросить подтверждение без TTY; замените плейсхолдеры на настоящие `true`/`false`, не удаляйте блок целиком.
- **Конфликты lockfile**: `pnpm install` должен разрешать их автоматически.

### Docker-сборка (pnpm workspace)
- **Без `.dockerignore` хостовый `node_modules` утекает в образ и всё ломает**: `COPY apps/web apps/web` (или `apps/api apps/api`) без `.dockerignore` тащит внутрь локальный `apps/web/node_modules`/`dist` с хоста — pnpm использует symlink'и на абсолютные хостовые пути (`/home/you/.../node_modules/.pnpm/...`), которых внутри контейнера не существует. Резолвинг модулей в Node идёт снизу вверх по дереву каталогов, так что этот протухший локальный `node_modules` **перекрывает** корректно установленный через `pnpm install` внутри образа. Реально словили этим: `apps/web`-сборка падала с «Cannot find module '@hookform/resolvers/zod'» — выглядело как проблема резолвинга peer-зависимостей pnpm (первая гипотеза), но изолированной проверкой подтверждено, что причина именно в этом — добавление `.dockerignore` (исключающего `node_modules`/`dist`/`.tmp` везде в дереве) само по себе полностью чинит сборку, копировать манифесты остальных пакетов монорепо для этого не требуется.
- **«column does not exist»**: прогнать `pnpm --filter api exec prisma migrate dev`, чтобы применить непримененные миграции.
- **Сбросить базу**: `pnpm --filter api exec prisma migrate reset` (деструктивно — только для dev).
- **`prisma migrate dev` падает с ошибкой `datasource.url`/`prisma.config.ts`**: вы случайно на Prisma v7. Проект закреплён на v6 — проверьте `apps/api/package.json`.

### Backend не стартует: «The class-validator package is missing»
- `ValidationPipe` в `main.ts` требует `class-validator` + `class-transformer` как peer-зависимости. Nest CLI не ставит их по умолчанию: `pnpm --filter api add class-validator class-transformer`.

### Сборка frontend
- **Ошибки «module not found»**: убедитесь, что протокол `workspace:*` корректно резолвит `@link-shortener/shared-types`.
- **Tailwind не применяет стили**: проверьте, что в `apps/web/src/index.css` есть `@import "tailwindcss"`.
- **`shadcn add` пишет файлы в буквальную директорию `./@/` вместо `src/`**: CLI читает алиас пути `@/` напрямую из `apps/web/tsconfig.json` и не следует по TS project `references` в `tsconfig.app.json`. Алиас должен быть объявлен **в обоих** файлах, `tsconfig.json` и `tsconfig.app.json` (`paths: {"@/*": ["./src/*"]}`) — а не только в `resolve.alias` `vite.config.ts`, который устраивает только бандлер, но не `tsc` и CLI-тулинг, читающий tsconfig напрямую. Раньше здесь ещё требовался `baseUrl: "."` — убран (`tsc` подтверждённо резолвит `paths` и без него в режиме `moduleResolution: "bundler"`, плюс сама опция deprecated и исчезнет в TypeScript 7.0). Если `shadcn add` когда-нибудь снова начнёт класть файлы не туда — значит его собственный, более простой парсер tsconfig всё-таки требует `baseUrl` (в отличие от `tsc`) — верните `"baseUrl": "."` рядом с `paths` в оба файла.
- **`erasableSyntaxOnly` (в `tsconfig.app.json`) запрещает parameter properties в конструкторе**: `constructor(public readonly x: T)` генерирует рантайм-код присваивания, который этот флаг запрещает. Объявляйте поля явно и присваивайте их в теле конструктора.

### Подключение к API
- **Ошибки CORS**: проверьте, что CORS включён в `apps/api/src/main.ts` для `http://localhost:5173`.
- **Connection refused**: проверьте, что backend запущен на порту 4000: `curl http://localhost:4000/health`.

### Аутентификация
- **Backend падает при старте с «JWT_SECRET is not set»**: это намеренно (`apps/api/src/auth/jwt-secret.ts`) — приложение отказывается стартовать вместо того, чтобы молча подписывать/проверять токены fallback-значением. Сгенерировать: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` и вставить в `apps/api/.env`.
- **«Sign in with Google» показывает страницу ошибки Google вместо экрана согласия**: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ещё не заданы реальными значениями. Остальное приложение прекрасно работает и без них — реальные креды нужны только этой кнопке. Как их получить:
  1. [Google Cloud Console](https://console.cloud.google.com/) → создать/выбрать проект.
  2. **OAuth consent screen** (APIs & Services): тип «External», заполнить название приложения + email — для локальной разработки достаточно режима «Testing», верификация Google не нужна.
  3. **Credentials** → «Create Credentials» → «OAuth client ID» → тип приложения «Web application».
  4. **Authorized redirect URIs** — добавить ровно `http://localhost:4000/auth/google/callback` (должно совпадать с `GOOGLE_CALLBACK_URL` в `.env`).
  5. Скопировать **Client ID** и **Client Secret** в `apps/api/.env` (`GOOGLE_CLIENT_ID=...`, `GOOGLE_CLIENT_SECRET=...`).
  6. Перезапустить backend (`pnpm --filter api dev`) — предупреждение «not configured» должно исчезнуть.
  7. `http://localhost:5173/login` → «Sign in with Google» теперь должен открыть настоящий экран согласия Google.
- **`uvx`/`pip` недоступны**: в этом окружении нет Python-тулинга для пакетного менеджера, поэтому `semgrep-mcp` (изначально планировался как MCP-сервер) нельзя поставить через `uvx`. Вместо этого используется официальный Docker-образ напрямую: `docker run --rm -v "$(pwd):/src" semgrep/semgrep semgrep scan --config=auto /src/apps/api/src /src/apps/web/src` — именно так делает `.claude/agents/security-reviewer.md`.

### Тестирование / E2E
- **`psql -v var=value -c "... :'var' ..."` падает с ошибкой синтаксиса на `:`**: подстановка переменных `psql` через `:'var'` работает только при чтении SQL из stdin/скрипта/интерактивного ввода, НЕ через сам аргумент `-c` (проверено напрямую на psql 16.15 — идентичный запрос через stdin работает нормально). Использовать `execFileSync('psql', [...], { input: sql })` вместо `-c`, см. `apps/e2e/tests/auth-helper.ts`.
- **E2E падает в CI с «No such container: link-shortener-db», но проходит локально**: `auth-helper.ts` изначально запускал `psql` через `docker exec` в локальный docker-compose контейнер по имени — в GitHub Actions такого контейнера нет (у Postgres-контейнера `services:` другое, внутреннее имя). Исправлено запуском `psql` через `docker run --network host postgres:16-alpine`, подключаясь напрямую к `localhost:5432` — работает одинаково локально и в CI, не завязано ни на имя контейнера, ни на наличие `psql` на хосте.
- **`web:type-check` падает только в CI/на чистом клоне с «Cannot find module '@link-shortener/shared-types'»**: задаче `type-check` в `turbo.json` нужен `dependsOn: ["^build"]` (как уже есть у `dev`/`build`/`test:e2e`) — `web` резолвит этот workspace-пакет по его собранному `dist/`, не по `src/`. Локально незаметно, пока `dist/` уже существует от любого прошлого `pnpm dev`/`build`; на по-настоящему чистом чекауте его нет.
- **`playwright install --with-deps` падает («sudo: a password is required»)**: в этом окружении нет root-доступа. Запускать `npx playwright install chromium` без флага — скачивает только сам бинарник браузера, который нормально работает и без системных библиотек, которые иначе поставил бы `--with-deps`.

## Ссылки

- [Документация Prisma](https://www.prisma.io/docs/)
- [Документация NestJS](https://docs.nestjs.com/)
- [React Router v7](https://reactrouter.com/)
- [TanStack Query](https://tanstack.com/query/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Turborepo](https://turbo.build/repo/docs)
- [pnpm](https://pnpm.io/)

## Статус проекта

Построен как учебное упражнение по Claude Code — весь стек рабочий: backend, frontend, Google OAuth, аналитика, покрытие тестами 80%+, CI/CD на GitHub Actions, Swagger-доки. История того, как проект дошёл до этого состояния — что сделано, что отличалось от плана, какие реальные баги ловило ревью — в **[`CHANGELOG.md`](CHANGELOG.md)** (корень, записи с датами) — этот файл фиксирует только то, что верно *сейчас*, а не как проект к этому пришёл.

**MCP-серверы теперь воспроизводимы**: пять из шести закоммичены в `.mcp.json` (см. таблицу выше) — свежий клон получает их автоматически при первом запуске Claude Code в этой директории. Раньше это было «известным пробелом» (настроено только локально на машине разработки, без `.mcp.json` в репозитории) — исправлено.

**Политика синхронизации документации**: каждый push проходит через `push-gate` (см. `.claude/README.md`), который синхронизирует затронутую документацию (этот файл, `CHANGELOG.md`, `README.md`, если поменялась установка) как часть подготовки push — не отдельный ручной шаг. См. `.claude/skills/push-gate/SKILL.md`.

**Автоматизация push**: здесь ничего не пушится вручную — pre-push hook (`.claude/hooks/push-gate.sh`) блокирует любой `git push`, не прошедший конвейер `push-gate` (ревью диапазона коммитов, которых ещё нет на remote — code+security, плюс глубокий auth/frontend/backend-слой если задет — и affected-тесты). `git commit` под отдельным, лёгким гейтом того же хука — только быстрый `pnpm lint`, без AI: коммит должен оставаться дешёвой, частой, локальной операцией (свободно коммитить, `--amend`, `rebase`), тяжёлый гейт принадлежит границе, где код реально покидает машину — push. Полная регрессия (весь тест-сьют, E2E, build) в `push-gate` тоже намеренно не входит — это работа уже существующего CI (`.github/workflows/ci.yml` — один workflow, job `e2e` стартует через `needs:` только после того, как job `lint-type-test-build` зелёный), дублировать её локально на каждый push было бы лишней стоимостью и временем без выигрыша. Полный механизм — в `.claude/README.md`.

---

_Обновлено: 2026-08-25_  
_Ведёт: учебный проект по Claude Code_
