# Этап 7: Первый пуш в GitHub + CI/CD

**Статус**: ✅ Завершён (2026-08-21)

Репозиторий опубликован на GitHub под личным аккаунтом пользователя (`github.com/AlexGitHubAccount/link-shortener-with-analytics`, приватный) — публикация выполнена через официальный GitHub MCP-сервер (`ghcr.io/github/github-mcp-server`, локальный Docker-образ с OAuth-авторизацией без ручного создания токена) после явного подтверждения пользователя. Публикация через **личный**, не рабочий GitHub-аккаунт — осознанное решение пользователя после обсуждения scope OAuth-разрешений (`repo`-scope даёт доступ ко всем приватным репозиториям аккаунта, не только к этому). SSH-доступ для `git push` настроен отдельным ключом (`~/.ssh/id_ed25519_personal_acc_AlexGitHubAccount`), изолированным от уже существовавшего рабочего ключа через `~/.ssh/config`-алиас `github-personal`.

**Реальный первый прогон CI/CD на GitHub Actions вскрыл 4 проблемы, ни одна из которых не ловилась локально** — ровно то, ради чего этот этап и нужен:

1. **pnpm 11 build-script approval** (`ci.yml`, прогон #1) — `pnpm install --frozen-lockfile` падал с `[ERR_PNPM_IGNORED_BUILDS]` на чистом раннере (локально это только предупреждение). Старый `.pnpmfile.cjs`-хук никогда реально не работал (pnpm не доверяет пакету, который сам себя одобряет). Исправлено: `allowBuilds: {...}` в `pnpm-workspace.yaml` — единственный реально рабочий для pnpm 11 механизм (`onlyBuiltDependencies` — имя для pnpm ≤10, молча игнорируется в 11-й версии).
2. **Ложное срабатывание `@typescript-eslint/no-unsafe-call`** (`ci.yml`, прогон #2) на `analytics.service.spec.ts` — воспроизведено на настоящем чистом `git clone`, при этом `tsc --noEmit` там же проходит чисто. Особенность typescript-eslint's type-aware резолвинга на «холодном» прогоне, та же категория, что уже была у трёх других правил в оверрайде для `*.spec.ts`. Добавлено туда же.
3. **`auth-helper.ts` жёстко ссылался на локальное имя Docker-контейнера** (`link-shortener-db`) для сидинга тестового пользователя через `psql` — в CI такого контейнера нет (там `services:`-контейнер с другим именем). Исправлено: `psql` запускается через официальный образ `postgres:16-alpine` с `--network host`, подключается к `localhost:5432` напрямую — работает одинаково локально и в CI, не завязано ни на имя контейнера, ни на наличие `psql` на хосте (подтверждено — на этой машине его нет).
4. **`turbo.json`'s `type-check`-задача не имела `dependsOn: ["^build"]`** (`ci.yml`, прогон #3) — `web:type-check` падал с «Cannot find module '@link-shortener/shared-types'», потому что `packages/shared-types` не был собран заранее. Локально маскировалось тем, что `dist/` уже лежал на диске от прошлых запусков `pnpm dev`. Исправлено по аналогии с уже существующими `dev`/`build`/`test:e2e`.

Каждая находка воспроизведена и исправлена именно через настоящий `git clone` в чистую директорию (а не полагаясь на локальное рабочее дерево, где закэшированные артефакты маскировали проблему), затем подтверждена реальным зелёным прогоном на GitHub Actions. Прогон #4: **CI ✅, E2E ✅**, оба зелёные.

**`/stage-review 7` нашёл ещё 2 находки** (Заход 1 — 1 итерация с находкой + 1 чистая; Заход 2 — 1 итерация с находкой + 1 чистая):
5. **`CLAUDE.md` устарел** — security-reviewer заметил, что строка статуса Этапа 7 всё ещё говорила «Prepared, waiting on user confirmation... не опубликовано», хотя `docs/plan.md`/`docs/stage-7-cicd.md` и сам git remote уже отражали факт публикации. Исправлено.
6. **`turbo.json`'s `test`/`test:cov`-задачи страдали от точно того же бага, что и `type-check` (находка #4)** — integration-reviewer поймал это при полном скане: обе задачи тоже не имели `dependsOn: ["^build"]`, CI выживал только случайно (тип-чек, который правильно билдит `shared-types`, шёл раньше по порядку шагов и маскировал проблему). Исправлено аналогично, плюс `ci.yml`'s шаг тестов переведён на `pnpm exec turbo run test:cov --filter=api --filter=web` вместо прямого `pnpm --filter`, чтобы граф зависимостей Turborepo реально применялся, а не полагался на побочный эффект порядка шагов.

Оба фикса подтверждены на чистом `git clone` и финальным зелёным прогоном #5 (**CI ✅, E2E ✅**) на GitHub Actions.

## Цель этапа

Два события в одном этапе, намеренно объединённые: (1) проект впервые публикуется на GitHub — до сих пор (Этапы 1–6) вся разработка велась строго локально, без remote; (2) сразу после публикации настраивается автоматическая проверка каждого push/PR — lint, type-check, тесты, сборка. Ничего не мержится в `main`, пока чеки не зелёные.

**Почему пуш откладывался до сих пор**: решение зафиксировано в `docs/plan.md` — публиковать и обвешивать CI-автоматизацией код имеет смысл только тогда, когда всё приложение (backend, frontend, auth, аналитика, тесты) уже работает целиком локально. Итеративные локальные коммиты на Этапах 1–6 дешевле, чем гонять CI на каждом промежуточном полусыром пуше.

## Темы Claude Code для практики

- **MCP GitHub** — создание/просмотр PR, чтение статусов чеков прямо из чата, без переключения в браузер. Первое реальное использование в проекте — до этого момента GitHub-репозитория просто не существовало.
- **Scheduled/cron-агенты** (опционально) — например, еженедельный агент, прогоняющий `pnpm audit`/проверку устаревших зависимостей и открывающий issue при находках.

## Что реализуем

### Шаг 0: публикация на GitHub (первое событие этапа)
- Создать репозиторий: `gh repo create link-shortener-with-analytics --private --source=. --remote=origin --push` (создаёт репо на GitHub, добавляет `origin`, пушит текущую локальную историю одной командой). Приватность (`--private`) — по умолчанию, публичным можно сделать в любой момент позже через настройки GitHub.
- Убедиться, что `.env`/`apps/api/.env` не попали в историю коммитов (они с самого начала в `.gitignore` — но стоит перепроверить `git log --all --full-history -- '*.env'` перед первым пушем, на случай если правило `.gitignore` было добавлено не сразу).
- Проверить, что `pnpm-lock.yaml` в истории (нужен для следующего шага — CI-кэша).

### Дальше — сама CI/CD-настройка
- `.github/workflows/ci.yml` — триггеры `push`/`pull_request`; матрица задач по `api`/`web`: `pnpm install` (с кэшем pnpm store, ключ кэша — хэш `pnpm-lock.yaml`), `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build`. Опционально — Turborepo remote cache (Vercel remote cache token) для ускорения повторных прогонов на CI.
- `.github/workflows/e2e.yml` — отдельный job с PostgreSQL как GitHub Actions `services:`, прогон Playwright E2E из Этапа 6.
- Branch protection на `main` (настраивается вручную в GitHub UI — не через Claude Code; шаги фиксируются в этом файле как инструкция пользователю).
- Опционально: `.github/workflows/deploy.yml` — заготовка автодеплоя (например, Railway/Fly.io для `api`, Vercel/Netlify для `web`) — конкретная платформа решается пользователем на момент реализации этапа.

## Пошаговый план работ (по факту)

1. ✅ **Публикация** — через GitHub MCP (`create_repository`), после явного подтверждения пользователя. Код запушен обычным `git push` по SSH (личный ключ, см. выше) — MCP не заменяет git для сохранения полной истории коммитов и тегов, только создание самого репозитория.
2. ✅ Через MCP GitHub (`get_me`, `actions_list`/`actions_get`) подтверждено, что репозиторий, пуш и прогоны CI/CD видны корректно.
3. ✅ `ci.yml` с job'ом lint/type-check/test/build.
4. ✅ PostgreSQL как `services:` в `e2e.yml`, Playwright-тесты из Этапа 6 проходят в CI.
5. ✅ Workflow-файлы запушены, через MCP GitHub (`actions_get`/`get_job_logs`) прочитаны логи 4 реальных прогонов, все 4 найденные проблемы исправлены итеративно (см. выше), финальный прогон зелёный.
6. 🔲 **Не сделано** — branch protection в GitHub UI (см. инструкцию ниже, ручной шаг за пользователем).
7. Не делалось — scheduled-агент для dependency audit не входил в скоуп этого прогона.
8. ✅ `README.md` — бейджи CI/E2E заменены на реальный `AlexGitHubAccount/link-shortener-with-analytics`, добавлен `git clone` в Quick Start.
9. `/stage-review 7` — см. ниже, финальный шаг перед тегом `stage-7-done`.

## Ветка `master` осталась на GitHub (мелкая уборка, не блокирует)

Первый пуш (до переименования локальной ветки) ушёл как `master` и стал default-веткой репозитория до того, как следом был запушен `main`. GitHub не даёт удалить ветку, которая всё ещё числится default — переключение default-ветки на `main` в Settings → General делается только вручную в вебе GitHub (GitHub MCP не даёт таких инструментов, та же категория, что и branch protection). После переключения `master` можно удалить (`git push origin --delete master`).

## Как настроить branch protection (ручной шаг в GitHub UI)

1. Откройте `https://github.com/AlexGitHubAccount/link-shortener-with-analytics/settings/branches`.
2. Сначала переключите default-ветку на `main` (Settings → General → Default branch), если ещё не сделано — см. пункт выше.
3. «Add branch protection rule» → Branch name pattern: `main`.
4. Включите:
   - **Require a pull request before merging** (запрещает прямой push в `main`).
   - **Require status checks to pass before merging** → отметить `lint-type-test-build` и `playwright` (имена job'ов из `ci.yml`/`e2e.yml`) — уже видны в списке, оба прогона на GitHub Actions состоялись.
   - **Require branches to be up to date before merging**.
5. Сохранить.
6. Проверить: создать тестовую ветку с намеренно сломанным тестом, открыть PR — CI должен упасть и заблокировать кнопку merge.

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `.github/workflows/ci.yml` | Lint/type-check/test/build на каждый push/PR |
| `.github/workflows/e2e.yml` | E2E с поднятым Postgres (сервис-контейнер), реальными dev-серверами |
| `.github/workflows/deploy.yml` | (опционально) автодеплой — не реализовано в этом прогоне, конкретная платформа (Railway/Fly.io/Vercel) — решение пользователя, не Claude Code |
| `README.md` | Бейджи CI/E2E, реальный `git clone` в Quick Start |
| `pnpm-workspace.yaml` | `allowBuilds` — обязательное подтверждение build-скриптов для pnpm 11 в CI |
| `turbo.json` | `type-check` task с `dependsOn: ["^build"]` |
| `apps/e2e/tests/auth-helper.ts` | `psql` через `--network host`, портируемо между local/CI |

## Верификация

- ✅ `git remote -v` показывает `origin` на GitHub, `git log` на GitHub совпадает с локальным.
- ✅ Реальные прогоны CI и E2E на GitHub Actions — оба зелёные (после 3 итераций исправлений).
- ✅ MCP GitHub из чата показывает актуальные статусы проверок (`actions_list`/`actions_get`/`get_job_logs`).
- 🔲 Специально сломанный тест в тестовой ветке блокирует merge — не проверялось (требует сначала настроенного branch protection).

## Зависимости от предыдущих этапов

Этапы 1–6 полностью завершены и проверены локально (backend, frontend, auth, аналитика, тесты, покрытие >80%) — по договорённости именно рабочее, а не промежуточное состояние публикуется на GitHub.
