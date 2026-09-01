#!/bin/bash
# Детерминированный quality-gate перед push. Вызывается из skill'а push-gate
# (.claude/skills/push-gate/SKILL.md), НЕ из git-хука напрямую.
#
# Один полный проход: запускает ВСЕ проверки до конца, никогда не обрывается на первой
# красной — чтобы отдать человеку сразу весь список проблем, а не по одной. Сам ничего не
# правит и не коммитит.
#
# Полная регрессия (весь `pnpm test`, E2E, `pnpm build` целиком) сюда НЕ входит — это работа
# CI (.github/workflows/ci.yml). Здесь — только то, что затронуто диапазоном, ожидающим push.
#
# Аргумент: $1 = diffBase (git-ref: апстрим, merge-base с origin/main или HEAD~1).
# Вывод: по строке `CHECK <name> <PASS|FAIL> exit=<code>` на каждую проверку, хвост лога
# каждой красной проверки между `----- <name> log (last 40) -----` маркерами, и финальная
# строка `GATE <PASS|FAIL>`. Exit 0 при PASS, 1 при FAIL.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 2

DIFF_BASE="${1:-}"
if [ -z "$DIFF_BASE" ]; then
  echo "usage: quality-checks.sh <diffBase>" >&2
  exit 2
fi
DIFF_RANGE="${DIFF_BASE}..HEAD"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

OVERALL_OK=true
declare -a RESULTS=()

# run_check <name> <command...> — прогоняет команду, лог в $TMP/<name>.log, запоминает исход.
run_check() {
  local name="$1"
  shift
  local log="$TMP/${name}.log"
  "$@" >"$log" 2>&1
  local code=$?
  if [ $code -eq 0 ]; then
    RESULTS+=("CHECK ${name} PASS exit=0")
  else
    RESULTS+=("CHECK ${name} FAIL exit=${code}")
    OVERALL_OK=false
  fi
}

# 1. Lint — весь монорепо (turbo-кэш, дёшево).
run_check lint pnpm lint

# 2/3/4. Type-check, unit-тесты и build — только пакеты, затронутые диапазоном.
#   Синтаксис turbo "affected since ref": --filter="...[<ref>]" (подтверждено по turbo docs).
#   Тесты гоняем через `test:cov`, а НЕ `test` — CI (ci.yml) enforce'ит порог покрытия 80%
#   (jest.coverageThreshold / vitest.config.ts), и голый `test` его не проверяет: гейт бы
#   пропустил падение, которое CI ловит (так и случилось однажды — branches 79.9% < 80%).
run_check type-check pnpm exec turbo run type-check --filter="...[${DIFF_BASE}]"
run_check test:cov   pnpm exec turbo run test:cov   --filter="...[${DIFF_BASE}]"
run_check build      pnpm exec turbo run build      --filter="...[${DIFF_BASE}]"

# 5. Скан секретов по добавленным строкам диапазона.
scan_secrets() {
  local added
  added="$(git diff "$DIFF_RANGE" -- . ':(exclude)*.md' ':(exclude).env.example' \
    | grep -E '^\+' | grep -vE '^\+\+\+' || true)"
  [ -z "$added" ] && return 0

  local hits=""
  # AWS access key id
  hits+="$(printf '%s\n' "$added" | grep -nE 'AKIA[0-9A-Z]{16}' || true)"
  # PEM private keys
  hits+="$(printf '%s\n' "$added" | grep -nE 'BEGIN [A-Z ]*PRIVATE KEY' || true)"
  # secret-подобное присваивание непустым непохожим-на-плейсхолдер значением (>=16 симв.)
  hits+="$(printf '%s\n' "$added" \
    | grep -inE '(client_secret|GOOGLE_CLIENT_SECRET|JWT_SECRET|api[_-]?key|access[_-]?token|password|secret)[\"'\'' ]*[:=][\"'\'' ]*[A-Za-z0-9/+_-]{16,}' \
    | grep -ivE 'REPLACE_ME|your[_-]|example|changeme|placeholder|xxxx|<[a-z]|process\.env|\$\{|env\(' || true)"

  if [ -n "$(printf '%s' "$hits" | tr -d '[:space:]')" ]; then
    echo "Возможные секреты в добавленных строках:"
    printf '%s\n' "$hits" | sed '/^$/d'
    return 1
  fi
  return 0
}

run_check secret-scan scan_secrets

# --- Отчёт ---
for line in "${RESULTS[@]}"; do
  echo "$line"
done
echo
for name in lint type-check test:cov build secret-scan; do
  case " ${RESULTS[*]} " in
    *"CHECK ${name} FAIL"*)
      echo "----- ${name} log (last 40) -----"
      tail -n 40 "$TMP/${name}.log" 2>/dev/null || echo "(нет лога)"
      echo "----- end ${name} -----"
      echo
      ;;
  esac
done

if [ "$OVERALL_OK" = true ]; then
  echo "GATE PASS"
  exit 0
else
  echo "GATE FAIL"
  exit 1
fi
