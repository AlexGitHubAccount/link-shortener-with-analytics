// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    // Jest's own types (jest.fn(), .mock.calls, jest.spyOn on inherited/third-party methods)
    // are inherently loosely-typed in ways these strict rules can't see through - destructuring
    // `.mock.calls[0]` is `any[]` by design, and `jest.spyOn(instance, 'inheritedMethod')`
    // trips `unbound-method` even though Jest handles binding internally. Relaxing these rules
    // for test files specifically (not production code) is the pattern typescript-eslint's own
    // docs recommend for this exact situation.
    //
    // `no-unsafe-call` added after a real GitHub Actions CI run (Stage 7) failed lint on
    // analytics.service.spec.ts with 3 "Unsafe call of a type that could not be resolved"
    // errors that never reproduced in this working directory, only in a genuinely fresh
    // `git clone` (confirmed by reproducing in /tmp against a clean clone + fresh install).
    // `pnpm type-check` (real `tsc --noEmit`) passes clean on that same fresh clone, so this is
    // not an actual type error — it's typescript-eslint's own type-aware project-service
    // occasionally failing to resolve a jest.Mock-typed provider's inferred return type on a
    // cold run, distinct from and less reliable than the compiler itself. Same class of issue
    // as the other three rules here: Jest test-file typing, not production correctness.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
