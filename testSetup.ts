// Extends bun:test's expect with the @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveValue, etc.) and wires up DOM cleanup between tests.
// Loaded via bunfig.toml preload.
import { afterEach, expect } from 'bun:test';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);

// @testing-library/react's auto-cleanup only registers when it finds a global
// `afterEach` (jest/vitest). bun:test exposes it as an import, so we wire cleanup
// ourselves — without this, renders accumulate across tests and queries match
// duplicate elements.
afterEach(() => {
  cleanup();
});

// Several tests intentionally trigger the library's own error/warning paths
// (onSubmit throwing/rejecting, double-submit, reset-while-submitting) and assert
// the resulting behavior. The library logs those on purpose, which spams the test
// output even though the tests pass. Silence ONLY those known, expected messages
// — anything else (real React warnings, act() notices, unexpected errors) still
// prints so we never hide a genuine problem.
const EXPECTED_LOG_PREFIXES = [
  'Unexpected form submission error:',
  'Attempted to reset form while submitting',
  'Form submission prevented: already submitting',
];

const isExpectedLog = (args: unknown[]): boolean => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  return EXPECTED_LOG_PREFIXES.some((prefix) => first.startsWith(prefix));
};

const realError = console.error.bind(console);
const realWarn = console.warn.bind(console);

console.error = (...args: unknown[]) => {
  if (!isExpectedLog(args)) realError(...args);
};
console.warn = (...args: unknown[]) => {
  if (!isExpectedLog(args)) realWarn(...args);
};
