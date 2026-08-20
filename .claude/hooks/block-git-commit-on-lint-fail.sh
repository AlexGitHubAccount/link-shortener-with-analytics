#!/bin/bash
# PreToolUse hook (matcher: Bash) — intercepts every Bash tool call. Claude Code sends the
# hook invocation payload as JSON on this script's STDIN (not argv) — see
# https://code.claude.com/docs/en/hooks.md. We only care about commands that are actually a
# `git commit` — everything else is allowed through untouched, immediately, without running
# lint/test on every single Bash call (that would be slow and pointless for e.g. `ls`).
set -euo pipefail

PAYLOAD="$(cat)"
COMMAND="$(echo "$PAYLOAD" | jq -r '.tool_input.command // empty')"

# Match "git commit" as a command word, not just a substring anywhere (avoids false-triggering
# on e.g. `git log --grep "git commit"` or a commit message that happens to contain the words).
if ! echo "$COMMAND" | grep -qE '(^|[;&|]|&&)\s*git commit\b'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Security-critical stage (auth/token handling) — lint+test must pass before this code can be
# committed. Run both explicitly rather than `A && B` inside a `!(...)` to keep failure
# attribution readable in the block message.
LINT_OK=true
TEST_OK=true
LINT_OUTPUT="$(pnpm lint 2>&1)" || LINT_OK=false
TEST_OUTPUT="$(pnpm test 2>&1)" || TEST_OK=false

if [ "$LINT_OK" = false ] || [ "$TEST_OK" = false ]; then
  REASON="Commit blocked by pre-commit hook: "
  [ "$LINT_OK" = false ] && REASON="${REASON}\`pnpm lint\` failed. "
  [ "$TEST_OK" = false ] && REASON="${REASON}\`pnpm test\` failed. "
  REASON="${REASON}Fix the errors and try again."

  jq -n --arg reason "$REASON" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
fi

exit 0
