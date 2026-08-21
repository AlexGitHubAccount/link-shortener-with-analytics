import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Separate from vite.config.ts (not merged via `mergeConfig`) so the dev-server-only
// concerns (proxy, optimizeDeps) never leak into the test environment, and vice versa.
// The `@` alias is duplicated here deliberately for the same reason config.ts's tsconfig
// paths gotcha exists — tools that read vite-style config directly need their own copy.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Excludes: generated shadcn primitives (vendor code, not ours to cover), route-level
      // barrel files that are pure composition with no branching logic of their own, and
      // config/type-only files.
      exclude: [
        'src/components/ui/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/lib/config.ts',
        '**/*.d.ts',
        '**/*.config.*',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
