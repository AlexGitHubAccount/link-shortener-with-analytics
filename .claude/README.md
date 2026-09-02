# `.claude/` — что здесь лежит и когда срабатывает

Две вещи: **гейт перед push** (детерминированные проверки качества) и **команда разработки**
(Agent Teams для реализации фич). Вручную вызываются два skill'а — `/push-gate` и
`/feature`; всё остальное срабатывает само.

## Гейт перед push

Детерминированный, предсказуемый, **только отчёт** — сам код не правит и не коммитит. Один
полный проход проверок → человек и Claude чинят находки вместе → повторный прогон → push.
Никакого цикла автопочинки, никаких автономных коммитов. Advisory-ревью: `qa-engineer`
(режим ревью) всегда + `devsecops-engineer` (режим ревью, если диапазон трогает auth- или
инфра-поверхность), оба субагентами без имени, один проход. Находка `severity: high` от
любого блокирует push.

| Файл | Тип | Когда | Что делает |
|---|---|---|---|
| `settings.json` | конфиг | всегда | (1) Регистрирует `PreToolUse`-hook (перед каждым Bash). (2) `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` — включает Agent Teams (см. ниже). (3) `permissions.deny` — Claude не читает `.env`/`.env.local`/`.env.*.local` (`.env.example` читаем). Зеркалит `.gitignore`. |
| `hooks/push-gate.sh` | hook | реагирует на `git commit` и `git push` отдельно | Два гейта по весу: (1) `git commit` → быстрый `pnpm lint` (без AI, коммитить можно свободно); (2) `git push` → проверка одноразовой расписки `.claude/.push-gate-passed` (sha256 диапазона `@{u}..HEAD`). Нет расписки → push блокируется с указанием запустить `/push-gate`. Хук расписку не создаёт — только проверяет. |
| `hooks/quality-checks.sh` | shell-скрипт | вызывается из skill'а `push-gate` | Один полный проход, никогда не обрывается на первой красной: `pnpm lint` · affected `type-check` · affected `test:cov` (порог 80%, как в CI) · affected `build` · скан секретов по добавленным строкам. Вывод — `CHECK <name> PASS/FAIL` + хвосты логов + `GATE PASS/FAIL`. |
| `skills/push-gate/SKILL.md` | skill `push-gate` | сам, когда hook отклонил push (или вручную `/push-gate`) | Оркестратор: диапазон → `quality-checks.sh` → advisory-субагенты без имени (`qa-engineer` всегда + `devsecops-engineer` в режиме ревью на auth-/инфра-поверхности) → единый отчёт человеку → при `GATE PASS` и без `high`-находок: doc-sync + расписка + `git push`; иначе — стоп, чиним вместе. **Точка входа для человека.** |
| `agents/qa-engineer.md` | agent — инженер по качеству, две шляпы | режим ревью: из `push-gate` и `feature`, без имени, всегда · режим тиммейта "qa": из `feature` Шаг 2, только под новый E2E | **Ревью** (read-only, ≤10 находок по схеме, не фиксер): корректность + явная безопасность + конвенции + адекватность тестов; `high` блокирует push. **E2E** (`apps/e2e/**`): Playwright-флоу нового пользовательского пути + axe-скан. Юнит-тесты — не его зона (их пишут dev-агенты). |
| `agents/devsecops-engineer.md` | agent — инженер DevSecOps, две шляпы | режим тиммейта "ops": из `feature` Шаг 2, когда фича трогает инфру/env/зависимости · режим ревью: без имени, из `push-gate` и `feature`, когда диапазон трогает security-поверхность (`auth/` · `common/guards\|decorators/` · `main.ts` · `redirect/` · `web/src/features/auth/` · `auth.store.ts` · `api-client.ts`) ИЛИ инфра-поверхность (`.github/workflows/` · `Dockerfile*` · `nginx.conf.template` · `docker-compose.yml` · `turbo.json` · `.dockerignore` · `pnpm-workspace.yaml` · `pnpm-lock.yaml` · `package.json` · `config/**`) | **Инженер** (пишет): `.github/`, `Dockerfile*`, `nginx`, `docker-compose`, `turbo.json`, `pnpm-workspace.yaml`, `main.ts`, `config/**`, `.env.example`, зависимости+lockfile, релиз/деплой миграций. **Ревью** (read-only): два прохода — security (8 областей + Semgrep) и devops (env во всех местах, `allowBuilds`/lockfile, `dependsOn: ["^build"]`, Docker-контекст, CI-обвязка, `pnpm audit`), делает только задетый. `high` блокирует push. |

Полная регрессия (весь тест-сьют, E2E, `pnpm build` целиком) в гейт **не входит** — это
работа CI (`.github/workflows/ci.yml`, job `e2e` через `needs:` после `lint-type-test-build`).

## Команда разработки (Agent Teams)

Экспериментальная фича Claude Code: несколько независимых сессий-тиммейтов под управлением
ведущего (лид = основная сессия). Включается `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` в
`settings.json`.

**Нет файла конфигурации команды** — `~/.claude/teams/session-*/` генерируется автоматически
на старте сессии, править руками нельзя. Роли задаются субагент-определениями в
`agents/*.md` (те же файлы работают и как обычные субагенты). Побочный эффект флага: любой
субагент, которому Claude даёт **имя**, стартует как тиммейт — поэтому `push-gate` запускает
`qa-engineer` без имени.

Состав — **1 + 4**, как в современной продуктовой команде: у каждого файла и каждой задачи
ровно один владелец. Полная карта — в `skills/feature/SKILL.md` («Полная карта
ответственности»).

| Файл | Роль | Зона владения |
|---|---|---|
| `skills/feature/SKILL.md` | skill `/feature <описание>` — плейбук ведущего | архитектурные решения (Шаг 1.2) → план с закреплением файлов → спавн тиммейтов → координация → ревьюеры без имени → `/push-gate` |
| `agents/backend-dev.md` | тиммейт «be» — бэкенд | `apps/api/src/**` бизнес-логика вкл. свои `*.spec.ts`, `apps/api/prisma/**` |
| `agents/frontend-dev.md` | тиммейт «fe» — фронтенд | `apps/web/src/**` вкл. свои `*.test.tsx`, `apps/web/vite.config.ts`/`vitest.config.ts` |
| `agents/qa-engineer.md` | «qa» / ревью — инженер по качеству | `apps/e2e/**` + ревью каждого диапазона (корректность/конвенции/тесты) |
| `agents/devsecops-engineer.md` | «ops» / ревью — инженер DevSecOps | `.github/`, `Dockerfile*`, `nginx`, `docker-compose`, `turbo.json`, `pnpm-workspace.yaml`, `main.ts`, `config/**`, `.env.example`, зависимости+lockfile, релиз/деплой + security/devops-ревью |

«You build it, you test it»: `be`/`fe` пишут и держат зелёными свои юнит/компонентные тесты
(`test:cov`, порог 80%). `qa` и `ops` — две шляпы: тиммейт (пишет свою зону) + субагент без
имени в режиме ревью (Шаг 4 / push-gate).

**Лид (основная сессия) — архитектор и координатор, кода и инфры не пишет.** Решения о
контракте, модели данных, security-постуре, семантике ошибок — точки стыковки между
тиммейтами, их принимает координатор (`/feature` Шаг 1.2). Инфра, CI, Docker, env-переменные,
зависимости, релиз — **зона `devsecops-engineer`**, не лида. Лид владеет только
документацией (`CHANGELOG`/`CLAUDE.md`/`README`/`.claude/**`) и запуском гейта.

Ревью после готовности фичи (`/feature` Шаг 4) — те же `qa-engineer` (всегда) и
`devsecops-engineer` в режиме ревью (security- или инфра-поверхность), что и в гейте,
субагентами без имени. Для особо чувствительного диапазона (auth) — `/code-review high`/`ultra`,
запускает пользователь; при `[security] high` от `devsecops-engineer` это рекомендуется прямо.

---

Датированная история (что было раньше, что и почему поменялось) — в `../CHANGELOG.md`.
Про стек и конвенции — в `../CLAUDE.md`.
