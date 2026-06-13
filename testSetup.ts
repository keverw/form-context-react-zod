// Extends bun:test's expect with the @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveValue, etc.). Loaded via bunfig.toml preload.
import { expect } from 'bun:test';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
