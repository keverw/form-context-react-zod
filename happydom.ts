// Registers a DOM (window, document, etc.) on the global scope so that
// @testing-library/react works under `bun test`. Loaded via bunfig.toml preload,
// which runs before any test file imports React Testing Library.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
