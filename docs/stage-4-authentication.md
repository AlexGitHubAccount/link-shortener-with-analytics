# Этап 4: Аутентификация — Google OAuth

**Статус**: ✅ Завершён (2026-08-21)

## Цель этапа

Многопользовательский режим: вход через Google, у каждого пользователя — только свои ссылки и своя аналитика. Приватные эндпоинты защищены JWT-guard'ом.

## Темы Claude Code для практики

- **Hooks** — `PreToolUse`/pre-commit хук в `.claude/settings.json` (или git hook), запускающий `lint`+`test` перед каждым коммитом. Особенно уместно именно здесь: security-критичный код (обработка токенов, секретов) не должен коммититься без проверки.
- **Кастомный subagent `security-reviewer`** — аудит auth-кода: утечка секретов в логи/код, небезопасное хранение токенов на фронте, отсутствие CSRF-защиты, некорректная проверка JWT-подписи.
- **MCP Semgrep** — статический анализатор (open-source, работает локально, не требует аккаунта) с готовыми правилами на security-паттерны (hardcoded secrets, небезопасные regex, SQL-инъекции). `security-reviewer` использует его как источник объективных находок в дополнение к собственному LLM-ревью кода — не полагаемся только на «мнение» модели.

## Что реализуем

### Backend
- Модуль `auth`: `AuthModule`, `GoogleStrategy` (`passport-google-oauth20`), `AuthController` (`GET /auth/google` — редирект на Google consent screen, `GET /auth/google/callback` — обмен кода на профиль, поиск/создание `User`, выдача JWT, редирект на фронт с токеном в query/fragment).
- `JwtStrategy` + `JwtAuthGuard` (`@nestjs/passport` + `@nestjs/jwt`).
- Зависимости: `@nestjs/passport`, `@nestjs/jwt`, `passport`, `passport-google-oauth20`, `passport-jwt`, `@types/passport-google-oauth20`.
- `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` (например `7d`).
- `users.service.ts`: `findOrCreateByGoogleProfile(profile)` — ищет по `googleId`, создаёт при первом входе.
- `JwtAuthGuard` навешивается на весь `links` контроллер (кроме `redirect` — он остаётся публичным намеренно).
- `@CurrentUser()` decorator достаёт `userId` из `req.user` (заполняется `JwtStrategy.validate()`) — используется во всех `links`-запросах для скоупинга (`WHERE userId = ...`), включая `findAll`, `findOne`, `update`, `remove`.
- Убрать хардкод seed-пользователя из `LinksService.create()` (заведён на Этапе 2, см. `stage-2-backend-core.md`), заменить на реальный `userId` из `@CurrentUser()`. Ссылки, созданные до этого момента, останутся привязаны к seed-пользователю — для учебного проекта это ожидаемо, миграция данных не требуется.

### Frontend
- `stores/auth.store.ts` (zustand): `token`, `user`, `login(token, user)`, `logout()`, персист в `localStorage` (через `zustand/middleware persist`).
- `features/auth/LoginPage.tsx` — кнопка «Войти через Google», редирект браузера на `GET /auth/google`.
- Обработка callback: страница/роут `/auth/callback` читает токен из query, сохраняет в `auth.store`, редиректит на `/`.
- `features/auth/AuthGuard.tsx` — обёртка защищённых роутов, редиректит неавторизованных на `/login`.
- `api-client.ts` дополняется: добавление заголовка `Authorization: Bearer <token>` из `auth.store` во все запросы; обработка `401` — автоматический `logout()` + редирект на `/login`.

## Пошаговый план работ

1. Завести Google Cloud OAuth-credentials (пользователь делает вручную в Google Cloud Console; в файле — пошаговая инструкция: создать проект, OAuth consent screen, credentials → OAuth Client ID, добавить redirect URI).
2. Реализовать backend auth flow (`AuthModule`, стратегии, контроллер).
3. Навесить `JwtAuthGuard` на `links`, добавить `@CurrentUser()` скоупинг во все методы `LinksService`.
4. Реализовать `auth.store`, `LoginPage`, обработку callback, `AuthGuard`.
5. Обновить `api-client.ts` — авторизационный заголовок и обработка 401.
6. Настроить pre-commit hook (`lint`+`test`) в `.claude/settings.json`.
7. Добавить MCP Semgrep (`claude mcp add semgrep -- uvx semgrep-mcp` или аналог), прогнать по `apps/api/src/auth/` и `apps/web/src/features/auth/`.
8. Кастомный subagent `security-reviewer` проверяет весь итоговый auth-код (backend + frontend), опираясь и на находки Semgrep, и на собственный анализ.
9. Сквозная проверка через `claude-in-chrome`: полный флоу логина от кнопки до Dashboard с реальными данными пользователя.
10. Прогнать `/stage-review 4` (см. `docs/plan.md`) — только после чистого результата статус меняется на ✅. Учитывая чувствительность этапа (auth), после чистого `stage-review` можно дополнительно вручную запустить `/code-review ultra`. Обязательно выполнить полную синхронизацию документации («Обязательное обновление документации после этапа» в `docs/plan.md`) — в частности, `CLAUDE.md` почти наверняка потребует обновления (появляется реальный auth-стек вместо заглушки).

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `apps/api/src/auth/*` | Google OAuth + JWT стратегии, контроллер |
| `apps/api/src/common/decorators/current-user.decorator.ts` | Извлечение `userId` из JWT |
| `apps/api/src/common/guards/jwt-auth.guard.ts` | Guard для приватных эндпоинтов |
| `apps/api/src/links/links.service.ts` | Доработка — скоупинг по `userId` |
| `apps/web/src/stores/auth.store.ts` | Zustand auth-стейт |
| `apps/web/src/features/auth/*` | LoginPage, AuthGuard, callback-обработка |
| `.claude/settings.json` | Pre-commit hook |
| `.claude/agents/security-reviewer.md` | Кастомный subagent |
| `apps/api/.env` | OAuth/JWT секреты (не коммитится) |

## Верификация

- Логин через Google в браузере → успешный редирект с валидным JWT → Dashboard показывает только ссылки текущего пользователя.
- `curl localhost:4000/links` без токена → `401 Unauthorized`.
- Второй Google-аккаунт видит пустой список (изоляция между пользователями подтверждена).
- Pre-commit hook блокирует коммит при падающих тестах/линте (проверить намеренно сломанным тестом).

## Как получить Google OAuth credentials (нужно сделать вручную)

Claude Code не может создать это за вас — требуется вход в ваш личный Google-аккаунт. Без этих значений вся остальная часть Этапа 4 (JWT, guards, скоупинг по пользователю) уже работает и проверена — не работает только сам клик «Войти через Google».

1. Откройте [Google Cloud Console](https://console.cloud.google.com/) → создайте новый проект (или выберите существующий).
2. **OAuth consent screen** (APIs & Services → OAuth consent screen): тип «External», заполните название приложения и email — для локальной разработки достаточно режима «Testing», не нужно проходить верификацию Google.
3. **Credentials** → «Create Credentials» → «OAuth client ID» → тип приложения «Web application».
4. **Authorized redirect URIs** — добавьте ровно: `http://localhost:4000/auth/google/callback` (должно совпадать с `GOOGLE_CALLBACK_URL` в `.env`).
5. Скопируйте **Client ID** и **Client Secret** в `apps/api/.env`:
   ```
   GOOGLE_CLIENT_ID=<ваш Client ID>
   GOOGLE_CLIENT_SECRET=<ваш Client Secret>
   ```
6. Перезапустите backend (`pnpm --filter api dev`) — при старте больше не должно быть warning'а `GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not configured`.
7. Откройте `http://localhost:5173/login`, нажмите «Sign in with Google» — должен открыться настоящий Google consent screen, а не страница с ошибкой.

## Как выполнялось по факту

- **`GET /auth/me`** — добавлен эндпоинт, которого не было в исходном плане буквально. План описывал только «читает токен из query/fragment, сохраняет в auth.store» — без указания, откуда брать email/displayName для отображения. Решение: не декодировать JWT на клиенте без проверки подписи (это антипаттерн), а добавить защищённый `GET /auth/me`, который `AuthCallback.tsx` вызывает сразу после получения токена — сервер уже проверяет подпись через `JwtAuthGuard`, фронтенд получает доверенные данные.
- **Токен в URL fragment, а не query** — план допускал оба варианта («в query/fragment»). Выбран fragment: он никогда не уходит на сервер в последующих запросах и не попадает в `Referer`-заголовки, в отличие от query-параметра.
- **`AuthUser` в `shared-types`** — по аналогии с находкой `/stage-review 2` про дублирование `Link`, тип пользователя сразу вынесен в общий пакет, а не продублирован в BE/FE отдельно.
- **Кнопка Sign out** — не была явно в плане, но без неё пользователь физически не может выйти из аккаунта через UI. Добавлена в `Dashboard.tsx`.
- **MCP Semgrep не подключился** — в окружении нет `uvx`/`pip` (весь Python-тулинг отсутствует), поэтому `claude mcp add semgrep -- uvx semgrep-mcp` из плана невозможен. Решение: `security-reviewer` gоняет официальный Docker-образ `semgrep/semgrep` напрямую (Docker уже используется в проекте под Postgres) — та же объективная находка без MCP-обвязки.
- **`.claude/agents/security-reviewer.md`** создан, но (как и `ui-reviewer` на Этапе 3, и MCP-серверы на Этапе 2) стал вызываемым только со следующего рестарта Claude Code. Ревью прогнано вручную через `general-purpose`-агента с теми же инструкциями.
- **Pre-commit hook** (`.claude/settings.json`, `PreToolUse` на `Bash`) реализован и протестирован как самостоятельный скрипт (намеренно сломанный тест → хук блокирует коммит с понятной причиной; восстановленный тест → пропускает) — но, по той же схеме, что MCP/агенты, хуки становятся активными только со следующего рестарта сессии. Коммит Этапа 4 прошёл без перехвата хуком (валидация была ручной), но с новой сессии `git commit` без прогона lint/test через Claude Code будет реально блокироваться.
- **Реальная находка `security-reviewer`**: `JWT_SECRET`, если не задан, использовался бы как один и тот же захардкоженный fallback-текст для подписи *и* проверки токена — значит, при пропаже `JWT_SECRET` в реальном деплое кто угодно смог бы подделать JWT для любого пользователя (значение публично в исходниках). Исправлено: вынесено в `auth/jwt-secret.ts::getRequiredJwtSecret()`, которая теперь **бросает исключение** и не даёт приложению стартовать без реального секрета — проверено вживую (временно убрал `JWT_SECRET` → приложение падает при старте с понятной ошибкой → восстановил → снова стартует чисто).
- **Дополнительный defense-in-depth фикс**: `LinksService.update()`/`.remove()` проверяли владение через `findOne()` заранее, но сама запись в БД (`prisma.link.update({where: {id}})`) не была ограничена по `userId` — полагалась только на предварительную проверку (check-then-act). Переведено на `updateMany({where: {id, userId}})`, чтобы сама операция записи была изолирована, а не только проверка перед ней.
- **Верификация без реального Google-аккаунта**: поскольку у Claude Code нет доступа к вашему Google-аккаунту, e2e-проверка логина выполнена через вручную сгенерированные JWT (тем же `JWT_SECRET`, что использует запущенный сервер) — это полноценно проверяет весь код после получения токена (callback-обработку, `/auth/me`, скоупинг, guard'ы, 401-обработку, изоляцию между пользователями), но не сам редирект на реальный Google consent screen и обратно — это последний кусок, который предстоит проверить вам лично после того как впишете реальные credentials по инструкции выше.

## Зависимости от предыдущих этапов

Этап 3 (UI и роутинг готовы, есть куда встраивать LoginPage/AuthGuard), Этап 2 (links CRUD — для добавления `userId`-скоупинга).
