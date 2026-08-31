#!/bin/bash
# PreToolUse hook (matcher: Bash) — intercepts every Bash tool call. Claude Code sends the
# hook invocation payload as JSON on this script's STDIN (not argv) — see
# https://code.claude.com/docs/en/hooks.md. Two independent gates live here, split by weight
# per standard practice (husky/lint-staged style): `git commit` gets only a fast, cheap check
# (commits stay free to make often, amend, rebase — normal git usage); `git push` gets the
# heavy AI-reviewed gate, because push is the point code actually leaves this machine (the
# same boundary where CI picks up). Everything else passes through untouched, immediately.
set -euo pipefail

PAYLOAD="$(cat)"
COMMAND="$(echo "$PAYLOAD" | jq -r '.tool_input.command // empty')"

cd "${CLAUDE_PROJECT_DIR:-.}"

deny() {
  local reason="$1"
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

# --- Gate on `git commit`: fast lint only. Matches as a command word, not just a substring
# anywhere (avoids false-triggering on e.g. `git log --grep "git commit"`). ---
if echo "$COMMAND" | grep -qE '(^|[;&|]|&&)\s*git commit\b'; then
  LINT_OK=true
  LINT_OUTPUT="$(pnpm lint 2>&1)" || LINT_OK=false
  if [ "$LINT_OK" = false ]; then
    deny "Commit blocked: \`pnpm lint\` failed. Fix the errors and try again."
  fi
  exit 0
fi

# --- Gate on `git push`: has the FULL push-gate pipeline (diff-scoped review + affected
# tests) already run against exactly the commits about to be pushed? We can't run the
# pipeline from inside a shell hook — it needs real agent reasoning, which only the calling
# Claude Code session can do. So this hook can only check for a receipt, not produce one. The
# marker is a hash of the push diff (commits in HEAD not yet on the upstream/remote), written
# by the push-gate skill's very last step, right before it retries the push itself. ---
if echo "$COMMAND" | grep -qE '(^|[;&|]|&&)\s*git push\b'; then
  # Diff range = what this push would actually send: commits reachable from HEAD but not from
  # the upstream tracking branch. Falls back to the merge-base with origin/main for a branch
  # that has never been pushed yet (no upstream configured). This exact fallback path is
  # unexercised so far (see .claude/skills/push-gate/SKILL.md) — if it misbehaves on a real
  # first push of a new branch, tighten it then rather than guessing now.
  UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
  if [ -n "$UPSTREAM" ]; then
    RANGE="$UPSTREAM..HEAD"
  else
    BASE="$(git merge-base HEAD origin/main 2>/dev/null || true)"
    RANGE="${BASE:-HEAD~1}..HEAD"
  fi

  MARKER=".claude/.push-gate-passed"
  CURRENT_HASH="$(git diff "$RANGE" 2>/dev/null | sha256sum | cut -d' ' -f1)"

  if [ -f "$MARKER" ] && [ "$(cat "$MARKER" 2>/dev/null)" = "$CURRENT_HASH" ]; then
    rm -f "$MARKER"   # one-shot receipt — consumed on use, so it can't cover a *different* later push
    exit 0
  fi

  deny "Push blocked: these commits have not passed the push-gate pipeline yet (no matching .claude/.push-gate-passed receipt for range '$RANGE'). Invoke the push-gate skill now — it reviews everything since the last push, runs the matching affected test scope, fixes what it finds, and retries this push itself once clean. Do not try to bypass this by writing the marker file directly."
fi

exit 0
