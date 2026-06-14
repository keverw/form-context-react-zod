// Teaches TypeScript about the @testing-library/jest-dom matchers we register on
// bun:test's `expect` in testSetup.ts (toBeInTheDocument, toHaveValue, etc.).
import { expect } from 'bun:test';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'bun:test' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Matchers<T = unknown> extends TestingLibraryMatchers<
    ReturnType<typeof expect.stringContaining>,
    T
  > {}
}
