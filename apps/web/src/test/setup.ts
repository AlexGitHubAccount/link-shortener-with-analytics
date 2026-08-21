// Runs once before the test file's suite (vitest.config.ts's setupFiles).
// Extends Vitest's `expect` with jest-dom matchers (toBeInTheDocument, toHaveTextContent, ...).
import '@testing-library/jest-dom/vitest';

// vitest.config.ts sets `globals: false`, so Testing Library's own auto-cleanup (which only
// registers itself when it detects a global `afterEach`) never kicks in. Without this, DOM
// from one test's render() stays mounted into the next test in the same file, causing
// "multiple elements found" / stale stray-node failures. Register it explicitly instead.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
