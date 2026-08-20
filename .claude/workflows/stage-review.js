export const meta = {
  name: 'stage-review',
  description: 'Двухзаходное ревью этапа в изолированном Workflow: Pass 1 (диф) + Pass 2 (полный скан). Все ревьюеры и фиксер работают в отдельных агентских контекстах, не засоряя основную сессию.',
  phases: [
    { title: 'Заход 1: диф этапа', detail: 'Параллельно: code-reviewer + security-reviewer, затем fixer-цикл' },
    { title: 'Заход 2: весь проект', detail: 'Integration-reviewer на полном скане, затем fixer-цикл' },
  ],
};

// === FINDINGS SCHEMA (shared for all reviewer roles) ===
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: ['number', 'null'] },
          summary: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['file', 'summary', 'severity'],
      },
    },
  },
  required: ['findings'],
};

// === ROLE PROMPTS ===

function codeReviewerPrompt(diffRange) {
  return `You are a code correctness reviewer, equivalent in strictness to Claude Code's code-review skill at "medium" effort level: report only HIGH-CONFIDENCE bugs that are clearly wrong, never style nitpicks or speculative concerns.

First, run \`git diff ${diffRange}\` yourself via Bash to get the actual change set — do not assume any diff text was passed to you. Then use Read/Grep/Glob to inspect full context of changed files to confirm an issue is real before reporting it.

Look for:
- Broken logic, logic errors, off-by-one mistakes
- Unhandled error paths, missing null/undefined checks
- Resource leaks, improper cleanup
- Type mismatches across changed module boundaries
- Control flow issues

Do NOT fix anything. Do NOT report security concerns (separate reviewer handles those). Do NOT report low-confidence or stylistic items.

Return findings via the given JSON schema. Empty findings array if nothing to report.`;
}

function securityReviewerPrompt(diffRange) {
  return `You are a security-focused reviewer, equivalent in strictness to Claude Code's security-review skill: HIGH-CONFIDENCE issues only.

First, run \`git diff ${diffRange}\` yourself via Bash to get the actual change set. Use Read/Grep to inspect context and confirm issues are real.

Look for:
- Hardcoded secrets, credentials, API keys, passwords
- SQL injection, command injection, template injection
- Auth/authz flaws (missing checks, broken JWT/session handling)
- Unsafe deserialization, unsafe eval/exec, dangerous use of \`new Function\`
- Path traversal, SSRF, insecure crypto for security-sensitive operations
- Missing input validation at trust boundaries

Do NOT fix anything. Do NOT report general correctness bugs (separate reviewer handles those). Do NOT report low-confidence or theoretical-only items.

Return findings via the given JSON schema. Empty findings array if nothing to report.`;
}

function integrationReviewerPrompt(scanPaths) {
  return `You are a cross-module INTEGRATION reviewer, equivalent to code-review at "medium" effort level (high-confidence only).

Scope: scan the FULL paths "${scanPaths}" — not a diff, the complete codebase. Use Glob/Grep/Read to find cross-module boundaries and shared-types contracts, then Read specific files to confirm suspected mismatches.

Your job is ONLY problems visible when looking at the entire project together:
- Function signature changed in one file, but unmodified file elsewhere still calls with old shape
- Type exported from shared-types but consumed with incompatible usage elsewhere
- Architectural boundary violations (e.g., web-layer directly accessing database layer)
- FE/BE contract inconsistencies (API endpoint signature change vs. client side not updated)

Do NOT re-report single-file bugs — that is not your role. Focus strictly on cross-module conflicts.

Return findings via the given JSON schema. Empty findings array if nothing to report.`;
}

function fixerPrompt(sections) {
  return `Apply minimal, correct fixes for the following reviewer findings. Make the smallest change per item that addresses the issue — no unrelated refactors, no hunting for additional issues beyond what is listed.

Then commit the fixes with a clear message like: "fix: address stage-review findings (pass N iteration M)"

Grouped findings:

${sections.map((s) => `## ${s.label}\n\n${JSON.stringify(s.findings, null, 2)}`).join('\n\n')}

Remember: just fix what is listed, nothing more.`;
}

// === MAIN WORKFLOW ===

// All code runs at top level of the module, but Workflow execution happens inside
// an async context, so we can use await on the top level.

const result = {
  status: 'clean', // or 'pass1-dirty' or 'pass2-dirty'
  pass1: { skipped: !!args.skipPass1, iterations: 0, findings: [] },
  pass2: { iterations: 0, findings: [] },
};

phase('Заход 1: диф этапа');

if (!args.skipPass1) {
  for (let i = 1; i <= 3; i++) {
    result.pass1.iterations = i;

    // Parallel: code-reviewer + security-reviewer on the diff
    const [codeRes, secRes] = await parallel([
      () =>
        agent(codeReviewerPrompt(args.diffRange), {
          label: `code-reviewer (iter ${i})`,
          schema: FINDINGS_SCHEMA,
        }),
      () =>
        agent(securityReviewerPrompt(args.diffRange), {
          label: `security-reviewer (iter ${i})`,
          schema: FINDINGS_SCHEMA,
        }),
    ]);

    const codeFindings = codeRes?.findings ?? [];
    const secFindings = secRes?.findings ?? [];

    log(`Заход 1, итерация ${i}: ${codeFindings.length} code findings, ${secFindings.length} security findings`);

    // If both clean, pass 1 is done
    if (codeFindings.length === 0 && secFindings.length === 0) {
      log('Заход 1: all findings resolved, moving to Pass 2');
      break;
    }

    // If this was the last iteration and still have findings, mark as dirty and stop
    if (i === 3) {
      result.pass1.findings = [...codeFindings, ...secFindings];
      result.status = 'pass1-dirty';
      log('Заход 1: reached max iterations with unresolved findings — marking as dirty');
      break;
    }

    // Otherwise: fix findings and loop back
    log(`Заход 1 iteration ${i}: fixing ${codeFindings.length + secFindings.length} findings...`);
    await agent(fixerPrompt([
      { label: 'Code correctness findings', findings: codeFindings },
      { label: 'Security findings', findings: secFindings },
    ]), {
      label: `fixer (pass1, iter ${i})`,
    });
  }
}

// If Pass 1 was dirty, return early — do not proceed to Pass 2
if (result.status !== 'pass1-dirty') {
  phase('Заход 2: весь проект целиком');

  for (let i = 1; i <= 3; i++) {
    result.pass2.iterations = i;

    // Integration reviewer on the full codebase
    const scanRes = await agent(integrationReviewerPrompt(args.scanPaths), {
      label: `integration-reviewer (iter ${i})`,
      schema: FINDINGS_SCHEMA,
    });

    const findings = scanRes?.findings ?? [];
    log(`Заход 2, итерация ${i}: ${findings.length} integration findings`);

    // If clean, pass 2 is done
    if (findings.length === 0) {
      log('Заход 2: all findings resolved');
      break;
    }

    // If this was the last iteration and still have findings, mark as dirty and stop
    if (i === 3) {
      result.pass2.findings = findings;
      result.status = 'pass2-dirty';
      log('Заход 2: reached max iterations with unresolved findings — marking as dirty');
      break;
    }

    // Otherwise: fix findings and loop back
    log(`Заход 2 iteration ${i}: fixing ${findings.length} findings...`);
    await agent(fixerPrompt([{ label: 'Integration findings', findings }]), {
      label: `fixer (pass2, iter ${i})`,
    });
  }
}
