export const meta = {
  name: 'push-gate-pipeline',
  description: 'Гейт перед push: ревью коммитов, которых ещё нет на remote (code+security, плюс глубокий auth/frontend/backend-слой если задет) + тесты/type-check, затронутые этим диапазоном. Недостающие тесты дописываются, а затем НЕЗАВИСИМО переверяются отдельным агентом на смысловую ценность (не просто "прошли", а реально что-то проверяют) — не только для только что дописанных, а для любого тест-файла в диапазоне. Ревью, тест-раннер и фиксер работают в отдельных агентских контекстах. Полная регрессия (весь тест-сьют, E2E, build) сюда намеренно не входит — это работа CI (ci.yml), гонять её ещё раз локально на каждый push было бы чистым дублированием.',
  phases: [
    { title: 'Ревью и тесты', detail: 'code+security(+auth/frontend/backend если нужно) ревью диапазона, affected-тесты, недостающие тесты + их независимая переверка, фиксер-цикл' },
  ],
};

// === SCHEMAS ===
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

const TEST_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    summary: { type: 'string' },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          suite: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['suite', 'message'],
      },
    },
  },
  required: ['passed', 'summary', 'failures'],
};

const WRITE_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    written: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceFile: { type: 'string' },
          testFile: { type: 'string' },
          status: { type: 'string', enum: ['written-and-verified', 'skipped-already-exists', 'failed'] },
        },
        required: ['sourceFile', 'testFile', 'status'],
      },
    },
  },
  required: ['written'],
};

// === PROMPTS ===
// diffRange is a symbolic expression like "origin/main..HEAD" (not a frozen commit hash) —
// re-resolves to the current HEAD every time an agent runs `git diff` with it, so it stays
// correct automatically as the fixer adds commits across iterations.

function codeReviewerPrompt(diffRange) {
  return `You are a code correctness reviewer, equivalent in strictness to "medium" effort: report only HIGH-CONFIDENCE bugs, never style nitpicks.

Run \`git diff ${diffRange}\` yourself via Bash to see exactly what these not-yet-pushed commits contain. Use Read/Grep/Glob for full context before reporting.

Look for: broken logic, off-by-one mistakes, unhandled error paths, missing null/undefined checks, resource leaks, type mismatches across changed module boundaries, control flow issues.

Do NOT fix anything. Do NOT report security concerns (separate reviewer handles those). Return findings via the given schema. Empty array if nothing to report.`;
}

function securityReviewerPrompt(diffRange) {
  return `You are a security-focused reviewer, HIGH-CONFIDENCE issues only.

Run \`git diff ${diffRange}\` yourself via Bash. Use Read/Grep for context.

Look for: hardcoded secrets/credentials, SQL/command/template injection, auth/authz flaws, unsafe deserialization/eval, path traversal, SSRF, insecure crypto, missing input validation at trust boundaries.

Do NOT fix anything. Do NOT report general correctness bugs. Return findings via the given schema. Empty array if nothing to report.`;
}

function deepSecurityPrompt(diffRange) {
  return `Run a full audit pass over the security-sensitive surface touched by the commits about to be pushed (\`git diff ${diffRange} --name-only\` to see which files) — this covers auth AND app-wide security config (main.ts) AND the public redirect endpoint, per your own scope. Follow your own scope and method exactly as defined for you. Return findings via the given schema (map your eight-category report onto this: one finding per real issue, empty array if genuinely clean across all categories).`;
}

function deepFrontendPrompt(diffRange) {
  return `Run your full frontend review — accessibility, visual consistency, React hygiene, TanStack Query conventions, and forms/routing UX — over the apps/web files touched by the commits about to be pushed (\`git diff ${diffRange} --name-only\` to see which files). Follow your own scope and method exactly as defined for you. Return findings via the given schema — one finding per real issue, empty array if genuinely clean.`;
}

function deepBackendPrompt(diffRange) {
  return `Run your NestJS + Prisma/DB correctness review over the backend files touched by the commits about to be pushed (\`git diff ${diffRange} --name-only\` to see which files) — but read the FULL \`apps/api/prisma/schema.prisma\` regardless of whether it changed, since a missing index is only visible against the whole model. Follow your own scope and method exactly as defined for you. Return findings via the given schema (map your eight-category report onto this: one finding per real issue, empty array if genuinely clean).`;
}

function affectedTestRunnerPrompt(diffRange, diffBase) {
  return `You determine and run ONLY the tests and type-checks affected by the commits about to be pushed — not the full suite.

CRITICAL: this is meant to be the ONE sweep that surfaces every affected-scope problem at once, so the fixer can address all of them in a single batch instead of one at a time. Run BOTH steps below regardless of whether an earlier one fails — never stop at the first failure. Collect every failure from every step into one report.

1. Find what changed: \`git diff ${diffRange} --name-only\`.
2. Use Turborepo's affected filtering (see turbo.json — tasks: test, type-check) to run only the workspace(s) that changed or depend on what changed, e.g. \`pnpm exec turbo run test type-check --filter=...[${diffBase}]\` — check Turborepo's actual current CLI syntax for "affected since a given ref" (consult Context7 MCP for turbo docs if the exact flag is unclear) rather than guessing. Within an affected package, prefer file-level scoping too if easy (Jest \`--changedSince\`, Vitest \`--changed\`) — but package-level affected is an acceptable minimum. Run type-check AND test even if one already failed — don't bail out early.
3. If nothing under apps/api, apps/web, or packages/shared-types changed (e.g. only docs), report passed:true with an empty failures list and say so in the summary — don't invent work.
4. Report exact commands run and their real exit codes for EVERY step you ran — never assume a result you didn't observe, and never omit a step just because an earlier one already failed.

Return via the given schema, with one failure entry per distinct failure (there can be many, from more than one step — list all of them).`;
}

function missingTestWriterPrompt(diffRange) {
  return `Find source files touched by the commits about to be pushed that have NO corresponding test file, and write one for each.

1. \`git diff ${diffRange} --name-only\` — changed files.
2. For each changed file under apps/api/src or apps/web/src that is actual logic (not a .module.ts, main.ts, dto/*.ts, or a pure type-definition file) and has no sibling \`*.spec.ts\` (backend) or \`*.test.tsx\`/\`*.test.ts\` (frontend): write a REAL test with meaningful assertions on actual behavior — read the source file in full first, never guess its shape. Mock PrismaService (backend) or fetch/apiClient (frontend) — never hit a real DB or network from a unit test. Cover the happy path, one realistic edge case, and an error path if the file has one.
3. RUN each test yourself and confirm it actually passes before reporting it written. Do NOT commit — leave the new test file in the working tree, staged (\`git add\` it). The orchestrating process commits it later, together with anything the fixer does in the same pass — avoids two subagents committing concurrently.
4. If a changed file already has a test, or genuinely isn't unit-testable (a pure DTO, a barrel export, a Nest module wiring file), report it as skipped-already-exists with a one-line reason — don't force a pointless test.

Return via the given schema.`;
}

function testQualityVerifierPrompt(diffRange) {
  return `Independently verify the quality of every test file touched by the commits about to be pushed. Do NOT trust any other agent's (or human's) self-report that a test "passes" or was "written and verified" — re-derive everything yourself, from scratch.

1. \`git diff ${diffRange} --name-only\` — find files matching *.spec.ts (backend, apps/api) or *.test.ts / *.test.tsx (frontend, apps/web) in this diff. If none, return an empty findings array immediately — don't invent work.
2. For each: run it yourself with the project's real test command (Jest for apps/api, Vitest for apps/web) and read its actual current content in full.
3. Judge, per file:
   - Did it actually pass when YOU just ran it — real exit code, not assumed, not taken on trust from anyone's report?
   - Are the assertions meaningful — do they exercise real behavior (return values, thrown exceptions, rendered DOM/roles, mock call arguments) — or are they tautological/placeholder (e.g. \`expect(true).toBe(true)\`), or so loose they'd pass even if the source file were broken (e.g. only checking a function doesn't throw, with no assertion on its actual effect)?
   - Is it testing implementation details that would break on any harmless refactor, rather than observable behavior?

Report one finding per test file that fails either check — file, one-line summary of what is actually wrong, severity ('high' if it does not genuinely pass when you run it yourself, 'medium' if it passes but is not meaningful). Empty array if every touched test file is genuinely solid.

Be skeptical — this exists specifically to catch a test written (by a human or another agent) just to make a coverage number go up without testing anything real. This is the same "write → independently verify → fix" discipline the project's standalone generate-tests.js used to apply before that logic was folded into missing-test-writer — you are the independent half that step needs.`;
}

function fixerPrompt(sections, iteration) {
  return `Apply minimal, correct fixes for the following findings/failures, directly in the working tree.

Make the smallest change per item that addresses the issue — no unrelated refactors, no hunting for additional issues beyond what is listed.

Grouped items:

${sections.map((s) => `## ${s.label}\n\n${JSON.stringify(s.data, null, 2)}`).join('\n\n')}

After editing, run \`git add -A && git commit -m "fix: address push-gate findings (iteration ${iteration})"\` yourself via Bash — this makes your fix (and any test file already staged by a prior step this iteration) part of what eventually gets pushed. Add exactly one commit; do NOT amend or rewrite any existing commit, do NOT rebase, do NOT push anything yourself — pushing happens once, later, after everything is clean.

Remember: just fix what is listed, nothing more.`;
}

// === MAIN WORKFLOW ===

// Not a target — a runaway-loop backstop. Each iteration already collects EVERY finding/
// failure in one full sweep (see the CRITICAL note in affectedTestRunnerPrompt above) and
// fixes them all in a single batch, so most real cases converge in 1-2 iterations. This cap
// only exists to stop something like a fixer oscillating between two conflicting "fixes"
// from looping forever — it should essentially never be hit in practice.
const MAX_ITERATIONS = 15;

const { diffRange, diffBase } = args;

const result = {
  status: 'clean',
  iterations: 0,
  findings: [],
  testFailures: [],
  testsWritten: [],
};

phase('Ревью и тесты');

for (let i = 1; i <= MAX_ITERATIONS; i++) {
  result.iterations = i;

  // {key, run} pairs, not bare thunks — the deep reviewers are pushed conditionally, so this
  // array's length/order varies push to push (only one area touched is the common case, not
  // all three). Zipping results back by KEY after parallel(), not by fixed array position, is
  // what keeps the result assignment below correct regardless of which subset of
  // needsSecurityDeep/needsFrontendDeep/needsBackendDeep is true — a positional destructure
  // here previously silently mislabeled (or dropped entirely) whichever deep-review result
  // landed at an index the fixed `const [a,b,c,d,e,f,g] = results` didn't expect.
  const taskDefs = [
    { key: 'code', run: () => agent(codeReviewerPrompt(diffRange), { label: `code-reviewer (iter ${i})`, schema: FINDINGS_SCHEMA }) },
    { key: 'security', run: () => agent(securityReviewerPrompt(diffRange), { label: `security-reviewer (iter ${i})`, schema: FINDINGS_SCHEMA }) },
    { key: 'test', run: () => agent(affectedTestRunnerPrompt(diffRange, diffBase), { label: `affected-tests (iter ${i})`, schema: TEST_RESULT_SCHEMA }) },
    { key: 'write', run: () => agent(missingTestWriterPrompt(diffRange), { label: `missing-tests (iter ${i})`, schema: WRITE_RESULT_SCHEMA }) },
  ];
  if (args.needsSecurityDeep) {
    taskDefs.push({ key: 'deepSecurity', run: () => agent(deepSecurityPrompt(diffRange), { label: `security-reviewer:deep (iter ${i})`, agentType: 'security-reviewer', schema: FINDINGS_SCHEMA }) });
  }
  if (args.needsFrontendDeep) {
    taskDefs.push({ key: 'frontend', run: () => agent(deepFrontendPrompt(diffRange), { label: `frontend-reviewer (iter ${i})`, agentType: 'frontend-reviewer', schema: FINDINGS_SCHEMA }) });
  }
  if (args.needsBackendDeep) {
    taskDefs.push({ key: 'backend', run: () => agent(deepBackendPrompt(diffRange), { label: `backend-reviewer (iter ${i})`, agentType: 'backend-reviewer', schema: FINDINGS_SCHEMA }) });
  }

  const rawResults = await parallel(taskDefs.map((t) => t.run));
  const byKey = Object.fromEntries(taskDefs.map((t, idx) => [t.key, rawResults[idx]]));
  const { code: codeRes, security: secRes, test: testRes, write: writeRes } = byKey;
  const deepSecRes = byKey.deepSecurity ?? null;
  const frontendRes = byKey.frontend ?? null;
  const backendRes = byKey.backend ?? null;

  const writtenThisIteration = (writeRes?.written ?? []).filter((w) => w.status === 'written-and-verified');
  if (writtenThisIteration.length) {
    result.testsWritten.push(...writtenThisIteration);
  }

  // Independent re-verification of EVERY test file in the current diff — not only what
  // missing-test-writer itself claims to have written this iteration. Runs AFTER the barrier
  // above (not inside parallel() alongside missing-test-writer), because it has to read files
  // that only exist on disk once the writer is actually done — reading them from a concurrent
  // agent could race a half-written file. Scoping it to "the whole diff" rather than "only
  // writeRes's self-report" also means a test the fixer patches in a later iteration gets
  // re-checked too, the same way every other reviewer here always re-reads the live diff
  // instead of trusting a previous iteration's verdict. A single self-grading agent (write it,
  // run it yourself, report "passed") cannot catch a tautological or too-loose test; this
  // second, skeptical pass is what the standalone generate-tests.js used to do (write ->
  // independently verify -> fix) before that logic got folded into missing-test-writer and the
  // independent half got lost — see testQualityVerifierPrompt above.
  const qualityRes = await agent(testQualityVerifierPrompt(diffRange), {
    label: `test-quality-verify (iter ${i})`,
    schema: FINDINGS_SCHEMA,
  });
  const testQualityFindings = qualityRes?.findings ?? [];

  const allFindings = [codeRes, secRes, deepSecRes, frontendRes, backendRes]
    .filter(Boolean)
    .flatMap((r) => r.findings ?? [])
    .concat(testQualityFindings);
  const testFailures = testRes?.passed === false ? (testRes.failures ?? []) : [];

  log(`Итерация ${i}: ${allFindings.length} находок ревью (из них ${testQualityFindings.length} по качеству тестов), ${testFailures.length} падений тестов, ${writtenThisIteration.length} тестов дописано`);

  if (allFindings.length === 0 && testFailures.length === 0) {
    log('Чисто.');
    break;
  }

  if (i === MAX_ITERATIONS) {
    result.findings = allFindings;
    result.testFailures = testFailures;
    result.status = 'dirty';
    log(`Достигнут потолок ${MAX_ITERATIONS} итераций с неразрешёнными находками — это ненормально, dirty`);
    break;
  }

  await agent(
    fixerPrompt(
      [
        { label: 'Code correctness findings', data: codeRes?.findings ?? [] },
        { label: 'Security findings', data: [secRes, deepSecRes].filter(Boolean).flatMap((r) => r.findings ?? []) },
        { label: 'Frontend findings', data: frontendRes?.findings ?? [] },
        { label: 'Backend/DB findings', data: backendRes?.findings ?? [] },
        { label: 'Test quality findings (rejected by independent re-verification)', data: testQualityFindings },
        { label: 'Affected test failures', data: testFailures },
      ],
      i,
    ),
    { label: `fixer (iter ${i})` },
  );
}

return result;
