# `.claude/` — что здесь лежит и когда срабатывает

Две вещи: **гейт перед push** (детерминированные проверки качества) и **команда разработки**
(Agent Teams для реализации фич). Вручную вызываются два skill'а — `/push-gate` и
`/feature`; всё остальное срабатывает само.

## Гейт перед push

Детерминированный, предсказуемый, **только отчёт** — сам код не правит и не коммитит. Один
полный проход проверок → человек и Claude чинят находки вместе → повторный прогон → push.
Никакого цикла автопочинки, никаких автономных коммитов. Advisory-ревью: `code-reviewer`
всегда + `devsecops-reviewer` (если диапазон трогает auth- или инфра-поверхность), оба
субагентами без имени, один проход. Находка `severity: high` от любого блокирует push.

| Файл | Тип | Когда | Что делает |
|---|---|---|---|
| `settings.json` | конфиг | всегда | (1) Регистрирует `PreToolUse`-hook (перед каждым Bash). (2) `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` — включает Agent Teams (см. ниже). (3) `permissions.deny` — Claude не читает `.env`/`.env.local`/`.env.*.local` (`.env.example` читаем). Зеркалит `.gitignore`. |
| `hooks/push-gate.sh` | hook | реагирует на `git commit` и `git push` отдельно | Два гейта по весу: (1) `git commit` → быстрый `pnpm lint` (без AI, коммитить можно свободно); (2) `git push` → проверка одноразовой расписки `.claude/.push-gate-passed` (sha256 диапазона `@{u}..HEAD`). Нет расписки → push блокируется с указанием запустить `/push-gate`. Хук расписку не создаёт — только проверяет. |
| `hooks/quality-checks.sh` | shell-скрипт | вызывается из skill'а `push-gate` | Один полный проход, никогда не обрывается на первой красной: `pnpm lint` · affected `type-check` · affected `test:cov` (порог 80%, как в CI) · affected `build` · скан секретов по добавленным строкам. Вывод — `CHECK <name> PASS/FAIL` + хвосты логов + `GATE PASS/FAIL`. |
| `skills/push-gate/SKILL.md` | skill `push-gate` | сам, когда hook отклонил push (или вручную `/push-gate`) | Оркестратор: диапазон → `quality-checks.sh` → advisory-субагенты без имени (`code-reviewer` всегда + `devsecops-reviewer` на auth-/инфра-поверхности) → единый отчёт человеку → при `GATE PASS` и без `high`-находок: doc-sync + расписка + `git push`; иначе — стоп, чиним вместе. **Точка входа для человека.** |
| `agents/code-reviewer.md` | agent (без имени, один проход) | из `push-gate` и `feature` | Лёгкое diff-scoped ревью: корректность + явная безопасность + конвенции. ≤10 находок по схеме. Не фиксер. `high` блокирует push. |
| `agents/devsecops-reviewer.md` | agent (без имени, по условию) | из `push-gate` и `feature`, когда диапазон трогает security-поверхность (`auth/` · `common/guards\|decorators/` · `main.ts` · `redirect/` · `web/src/features/auth/` · `auth.store.ts` · `api-client.ts`) ИЛИ инфра-поверхность (`.github/workflows/` · `Dockerfile*` · `nginx.conf.template` · `docker-compose.yml` · `turbo.json` · `.dockerignore` · `pnpm-workspace.yaml` · `pnpm-lock.yaml` · любой `package.json` · `config/env.validation.ts`) | Два прохода: **security** (8 областей — JWT-подпись/отзыв, IDOR/скоупинг, CORS+helmet+ValidationPipe, публичный redirect, утечка секретов; + Semgrep) и **devops** (env-переменная во всех местах, `allowBuilds`/lockfile, `dependsOn: ["^build"]`, Docker-контекст/`.dockerignore`, CI-обвязка, `pnpm audit`). Делает только задетый проход. Не фиксер. `high` блокирует push; при `[security] high` рекомендуется `/code-review ultra`. |

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
`code-reviewer` без имени.

Состав — **1 + 3 + 2**: лид (архитектор) + три тиммейта + два субагента-ревьюера.

| Файл | Роль | Зона |
|---|---|---|
| `skills/feature/SKILL.md` | skill `/feature <описание>` — плейбук ведущего | архитектурные решения (Шаг 1.2) → план с закреплением файлов → спавн тиммейтов → координация → ревьюеры без имени → `/push-gate` |
| `agents/backend-dev.md` | тиммейт-разработчик бэкенда | `apps/api/src/**` (продакшен-код, без `*.spec.ts`), `apps/api/prisma/**`, миграции |
| `agents/frontend-dev.md` | тиммейт-разработчик фронтенда | `apps/web/src/**` (продакшен-код, без `*.test.tsx`) |
| `agents/test-engineer.md` | тиммейт-инженер по тестам — единственный владелец всех тестов | `*.spec.ts` (Jest) · `*.test.tsx` (Vitest+RTL) · `apps/e2e/**` (Playwright), порог покрытия 80% |

Всё тестирование в одних руках — `backend-dev`/`frontend-dev` пишут только продакшен-код,
тестов не трогают; сломанный от смены поведения тест чинит `test-engineer`. Самая чистая
граница владения, нулевой риск параллельной записи в один файл.

**Архитектор — это лид (основная сессия), не отдельный агент.** Решения о контракте, модели
данных, миграциях, security-постуре и инфре — точки стыковки между тиммейтами, их принимает
координатор (`/feature` Шаг 1.2). **DevOps отдельной ролью нет** — инфра-файлы (`.github/`,
`Dockerfile*`, `turbo.json`, `docker-compose.yml`, `nginx.conf.template`) правит лид
напрямую; их безопасность и корректность проверяет devops-проход `devsecops-reviewer`.

Ревью после готовности фичи (`/feature` Шаг 4) — те же `code-reviewer` (всегда) и
`devsecops-reviewer` (security- или инфра-поверхность), что и в гейте, субагентами без имени.
Для особо чувствительного диапазона (auth) — `/code-review high`/`ultra`, запускает
пользователь; при `[security] high` от `devsecops-reviewer` это рекомендуется прямо.

---

Датированная история (что было раньше, что и почему поменялось) — в `../CHANGELOG.md`.
Про стек и конвенции — в `../CLAUDE.md`.
