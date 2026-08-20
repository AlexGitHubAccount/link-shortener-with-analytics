# Этап 4: Аутентификация — Google OAuth

**Статус**: ⏳ Запланирован

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

## Зависимости от предыдущих этапов

Этап 3 (UI и роутинг готовы, есть куда встраивать LoginPage/AuthGuard), Этап 2 (links CRUD — для добавления `userId`-скоупинга).
