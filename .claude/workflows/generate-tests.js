export const meta = {
  name: 'generate-tests',
  description: 'Parallel unit test generation (backend Jest, frontend Vitest+RTL) with independent peer verification per file — a second, separate agent re-runs each generated test and judges whether it is meaningful, not just self-reported passing.',
  phases: [
    { title: 'Generate', detail: 'One agent per target file writes+iterates its own test until it passes' },
    { title: 'Verify', detail: 'A different agent independently re-runs and judges each test' },
    { title: 'Fix', detail: 'Only for targets the verifier rejected' },
  ],
};

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    ranSuccessfully: { type: 'boolean' },
    meaningful: { type: 'boolean' },
    reasoning: { type: 'string' },
  },
  required: ['ranSuccessfully', 'meaningful', 'reasoning'],
};

function generatePrompt(target) {
  return `You are writing a real, meaningful unit test for this project (link-shortener-with-analytics monorepo).

Target source file: ${target.file}
Test file to create: ${target.testFile}
Test runner: ${target.kind === 'jest' ? 'Jest (backend, apps/api)' : 'Vitest + React Testing Library (frontend, apps/web)'}

${target.instructions}

Requirements:
- Read the target source file FIRST, in full - do not guess its shape or behavior.
- Write REAL tests with meaningful assertions on actual behavior (return values, thrown exceptions, rendered DOM text/roles, call arguments to mocks) - never a tautological placeholder like \`expect(true).toBe(true)\` or a test that doesn't actually exercise the code under test.
- ${target.kind === 'jest' ? 'Mock PrismaService via NestJS testing module .overrideProvider() with a plain object of jest.fn()s for the exact Prisma methods the code under test actually calls - never hit the real Postgres database from a unit test.' : 'Mock apiClient/fetch as needed - never make a real network call from a component test. Use @testing-library/react\'s render/screen/userEvent, and jest-dom matchers are already available via the global test setup (apps/web/src/test/setup.ts).'}
- Cover: the happy path, at least one realistic edge case, and at least one error/failure path if the source file has one (thrown exception, rejected promise, error UI state).
- After writing, RUN the test yourself (${target.runCmd}) and iterate until it actually passes - do not hand off a test you haven't confirmed passes.

Return a short summary of what you tested and confirm the exact command + output showing it passing.`;
}

function verifyPrompt(target) {
  return `Independently verify a unit test another agent just wrote for this project. Do NOT trust their self-report - re-run it yourself from scratch.

Source file: ${target.file}
Test file: ${target.testFile}

1. Run: ${target.runCmd}
2. Read the test file's actual content.
3. Judge:
   - ranSuccessfully: did the command you just ran actually pass (real exit code, not assumed)?
   - meaningful: do the assertions actually exercise real behavior of the source file (return values, exceptions, rendered output, mock call arguments) - NOT a tautological placeholder, NOT an assertion so loose it would pass even if the source file were broken (e.g. just checking a function doesn't throw, with no assertion on its actual return value/effect), NOT testing implementation details that would break on any harmless refactor rather than testing observable behavior.
   - reasoning: 1-2 sentences justifying both verdicts with something specific from the test file's actual content.

Be skeptical - this is exactly the kind of check that catches an agent that wrote a test just to make a coverage number go up without testing anything real.`;
}

function fixPrompt(target, verdict) {
  return `A previous agent's unit test for ${target.file} (test file: ${target.testFile}) was rejected by an independent verifier:

ranSuccessfully: ${verdict.ranSuccessfully}
meaningful: ${verdict.meaningful}
reasoning: ${verdict.reasoning}

Read the current test file and the source file it's testing, fix the specific problem(s) the verifier described, then run ${target.runCmd} yourself and confirm it actually passes before finishing. Do not just make assertions looser to force a pass - fix the test to genuinely and meaningfully exercise the source file's real behavior.`;
}

const results = await pipeline(
  args.targets,
  (target) => agent(generatePrompt(target), { label: `generate:${target.file}`, phase: 'Generate' }),
  (_genResult, target) =>
    agent(verifyPrompt(target), { label: `verify:${target.file}`, phase: 'Verify', schema: VERDICT_SCHEMA }),
  async (verdict, target) => {
    if (verdict && verdict.ranSuccessfully && verdict.meaningful) {
      return { file: target.file, testFile: target.testFile, status: 'clean', verdict };
    }

    log(`${target.file}: verifier rejected (ranSuccessfully=${verdict?.ranSuccessfully}, meaningful=${verdict?.meaningful}) - fixing`);
    await agent(fixPrompt(target, verdict ?? { ranSuccessfully: false, meaningful: false, reasoning: 'no verdict returned' }), {
      label: `fix:${target.file}`,
      phase: 'Fix',
    });

    const reverdict = await agent(verifyPrompt(target), {
      label: `reverify:${target.file}`,
      phase: 'Fix',
      schema: VERDICT_SCHEMA,
    });

    return {
      file: target.file,
      testFile: target.testFile,
      status: reverdict.ranSuccessfully && reverdict.meaningful ? 'fixed' : 'still-failing',
      verdict: reverdict,
    };
  },
);

const stillFailing = results.filter((r) => r && r.status === 'still-failing');
if (stillFailing.length > 0) {
  log(`${stillFailing.length} test(s) still failing verification after one fix attempt: ${stillFailing.map((r) => r.file).join(', ')}`);
}

return { results, stillFailingCount: stillFailing.length };
