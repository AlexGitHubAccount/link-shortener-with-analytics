---
name: push-gate
description: Гейт перед push — один полный проход детерминированных проверок качества по коммитам, которых ещё нет на remote (lint, affected type-check/test/build, скан секретов) + advisory-ревью `oncall-qa` (и `oncall-devsecops` в режиме ревью, если диапазон трогает auth- или инфра-поверхность). Проверки идут до конца, собирают ВСЁ и отдаются человеку с объяснением; гейт сам код НЕ правит и НЕ коммитит. Push блокируется, пока все детерминированные проверки не зелёные и нет находок severity:high от ревьюеров. Полная регрессия (весь тест-сьют, E2E) — работа CI, сюда не входит. Срабатывает сам, когда pre-push hook (.claude/hooks/push-gate.sh) отклоняет `git push`. Можно вызвать вручную (`/push-gate`).
---

# push-gate

Детерминированный, предсказуемый гейт перед push. **Никакого цикла автопочинки, никаких
автономных коммитов.** Один проход проверок + до двух advisory-ревьюеров (без имени) →
отчёт → человек и Claude чинят вместе → повторный прогон → push.

Диапазон для ревью — **все локальные коммиты, которых ещё нет на remote**: `@{u}..HEAD`,
если апстрим настроен, иначе merge-base с `origin/main` (первый push новой ветки).

Точка входа для человека — `/push-gate` (у skill'ов приоритет в `/`-автокомплите).

## Когда срабатывает

- **Автоматически**: попытка запушить («запушь», «отправь», прямой `git push`) → hook
  блокирует голый `git push` с сообщением «invoke /push-gate now». Увидев отказ — запускать
  этот skill сразу, без уточнений.
- **Вручную**: `/push-gate`, чтобы проверить неотправленные коммиты до решения пушить.

## Шаг 0: подготовка

1. Определить диапазон:
   ```
   UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)
   if [ -n "$UPSTREAM" ]; then
     diffBase="$UPSTREAM"
   else
     diffBase="$(git merge-base HEAD origin/main 2>/dev/null || echo HEAD~1)"
   fi
   diffRange="${diffBase}..HEAD"
   ```
   Это символьные выражения (не застывшие хэши) — переразрешаются в актуальный `HEAD` при
   каждом `git diff`.

2. **Docs-only быстрый путь**: `git diff ${diffRange} --name-only` — если ВСЕ файлы `.md`,
   пропустить Шаги 1–3: детерминированные проверки и ревьюер на чистой прозе ничего не
   находят. Сразу писать receipt и пушить:
   ```
   git diff ${diffRange} | sha256sum | cut -d' ' -f1 > .claude/.push-gate-passed
   git push
   ```
   Если хотя бы один файл не `.md` — обычный путь ниже.

3. Если в диапазоне нет ни одного файла (пустой диапазон) — сказать пользователю, что
   пушить нечего, и остановиться.

## Шаг 1: детерминированные проверки (один проход)

Запустить `bash .claude/hooks/quality-checks.sh "$diffBase"`.

Скрипт гонит ДО КОНЦА, не обрываясь на первой красной:
1. `pnpm lint` (весь монорепо)
2. `pnpm exec turbo run type-check --filter="...[$diffBase]"` (affected)
3. `pnpm exec turbo run test:cov --filter="...[$diffBase]"` (affected — `test:cov`, не `test`: CI enforce'ит порог покрытия 80%)
4. `pnpm exec turbo run build --filter="...[$diffBase]"` (affected)
5. Скан секретов по добавленным строкам диапазона (regex; `.env.example` и `*.md` исключены)

Вывод — строки `CHECK <name> <PASS|FAIL> exit=<code>`, хвосты логов красных проверок и
финальная `GATE PASS|FAIL`. Сохранить весь вывод для отчёта.

Полная регрессия (весь `pnpm test`, E2E, `pnpm build` целиком) сюда НЕ входит — это работа
CI (`.github/workflows/ci.yml`).

## Шаг 2: advisory-ревью (субагенты БЕЗ имени, один проход)

**Все субагенты здесь — без `name`** (при включённых Agent Teams именованный субагент стал бы
тиммейтом; здесь это не нужно). Максимум два: один всегда, второй — по условию.

### 2.1 oncall-qa (режим ревью) — всегда

`Agent({ subagent_type: 'oncall-qa', prompt: ... })`

Промпт: «Review mode. Review the not-yet-pushed commits. Range: `${diffRange}`. Follow your
own review scope (correctness, conventions, explicit security, test adequacy). Return findings
via this schema: `{ findings: [{ file, line, summary, severity }] }` (severity ∈
high|medium|low), max 10, empty array if clean.»

### 2.2 oncall-devsecops (режим ревью) — только если диапазон трогает security- или инфра-поверхность

`git diff ${diffRange} --name-only` — если хоть один файл под одним из путей:
- **security-проход**: `apps/api/src/auth/`, `apps/api/src/common/guards/`,
  `apps/api/src/common/decorators/`, `apps/api/src/main.ts`, `apps/api/src/redirect/`,
  `apps/web/src/features/auth/`, `apps/web/src/stores/auth.store.ts`,
  `apps/web/src/lib/api-client.ts`
- **devops-проход**: `.github/workflows/`, `apps/api/Dockerfile`, `apps/web/Dockerfile`,
  `apps/web/nginx.conf.template`, `docker-compose.yml`, `turbo.json`, `**/.dockerignore`,
  `pnpm-workspace.yaml`, `pnpm-lock.yaml`, любой `package.json`,
  `apps/api/src/config/env.validation.ts`

запустить вторым субагентом (тоже без имени):

`Agent({ subagent_type: 'oncall-devsecops', prompt: ... })`

Промпт: «Review mode. Review the not-yet-pushed commits. Range: `${diffRange}`. Do only the
pass(es) whose zone the diff actually touches (security / devops). Follow your own review
scope. Return findings via this schema: `{ findings: [{ file, line, summary, severity }] }`
(severity ∈ high|medium|low), max 10, empty array if clean.»

Можно запускать 2.1 и 2.2 параллельно.

### Общее

Это **совет, не гейт по себе**: если субагент упал / вышел по `maxTurns` / вернул мусор —
записать «<reviewer>: skipped/failed» и идти дальше. НЕ перезапускать, НЕ спавнить третий.
Но находка `severity: high` от ЛЮБОГО из двух блокирует push (см. Шаг 4).

## Шаг 3: единый отчёт пользователю

Собрать в одном сообщении:
- Таблица `CHECK` из Шага 1 (что PASS, что FAIL).
- Для каждой FAIL — что именно сломалось (из хвоста лога), где, почему это важно,
  направление фикса. **Подробно** — пользователь по этому отчёту принимает решения.
- Находки Шага 2 (`oncall-qa` и, если запускался, `oncall-devsecops`), сгруппированные
  по severity, с пометкой от какого ревьюера (и `[security]`/`[devops]` для второго).

## Шаг 4: решение

- **`GATE PASS` (Шаг 1) И нет находок `severity: high` из Шага 2**:
  1. Если что-то осталось только staged (маловероятно — гейт не пишет код) — закоммитить.
  2. **Синхронизация документации**: одна запись в `CHANGELOG.md` (дата, без номера этапа) —
     что сделано, что отличалось от намерения. Обновить `CLAUDE.md`, если поменялся
     стек/конвенции/появилась грабля. Обновить `README.md`, если поменялись шаги установки.
     `git add -A && git commit -m "docs: sync CHANGELOG/CLAUDE.md/README"` — если реально
     что-то поменялось.
  3. Пересчитать `diffRange` (те же команды Шага 0.1 — база та же, `HEAD` уже включает
     doc-коммит) и записать receipt:
     `git diff ${diffRange} | sha256sum | cut -d' ' -f1 > .claude/.push-gate-passed`
  4. `git push` — hook пропустит (хэш совпадёт, receipt одноразово потребится).
  5. Короткая сводка: что проверено, что нашли, что обновлено в документации.

- **`GATE FAIL` ИЛИ есть находки `severity: high`**:
  1. **НЕ пушить, НЕ писать receipt.**
  2. Показать полный отчёт Шага 3.
  3. Дальше разбираем и чиним вместе с пользователем в основной сессии (обычными Edit/Bash,
     не автономным агентом). После правок — повторный `/push-gate`.
  4. Если `oncall-devsecops` (Шаг 2.2) вернул `[security] high` — **настоятельно**
     предложить `/code-review ultra` перед повторной попыткой (глубокое облачное ревью auth,
     платно, инициирует пользователь). Для обычных `high` — просто чиним и перезапускаем.

## Что этот skill НЕ делает

- Не правит код и не коммитит фиксы (кроме doc-sync коммита на чистом прогоне).
- Не генерирует недостающие тесты (юниты пишут `core-backend`/`core-frontend`, E2E — `oncall-qa`
  в `/feature`, не гейт).
- Не крутит цикл «нашли → починили → перепроверили».
- Не запускает больше двух субагентов (`oncall-qa` в режиме ревью всегда + `oncall-devsecops`
  в режиме ревью по условию), оба без имени, один проход.
- Не гоняет полную регрессию/E2E (это CI).
