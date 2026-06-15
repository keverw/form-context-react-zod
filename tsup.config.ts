import { defineConfig, type Options } from 'tsup';
import type { Plugin } from 'esbuild';

// The published subpath the shared contexts resolve to at runtime.
const SHARED_CONTEXT = 'form-context-react-zod/context';

// ---------------------------------------------------------------------------
// Shared-context singleton (the whole reason this build is multi-entry-aware).
//
// `src/lib/context.ts` creates the two React contexts (FormContext +
// FormFieldContext). Every entry that touches a context — `.` via FormProvider/
// hooks, `./devtools` via FormState — imports it relatively (`./context` from
// src/lib, `../context` from src/lib/hooks). If esbuild inlined that module into
// each bundle, each entry would get its OWN createContext() result, and a
// consumer reading the context (FormState, useField) would see `null` instead of
// the value FormProvider published.
//
// So we intercept those relative imports and rewrite them to the EXTERNAL
// subpath `form-context-react-zod/context`. Node then resolves every entry to
// the one published `./context` module, guaranteeing a single instance. This is
// a runtime JS singleton concern (esbuild), not a type concern — the `.d.ts`
// side is structural, so inlined/duplicated declarations stay compatible.
// Mirrors unirend's tsup.config.ts (keverw/unirend).
const sharedContextPlugin: Plugin = {
  name: 'externalize-shared-context',
  setup(build) {
    // Matches the relative specifiers `./context` and `../context`.
    build.onResolve({ filter: /^\.\.?\/context$/ }, (args) => {
      if (args.kind === 'entry-point') return; // building context.ts itself

      const resolveDir = args.resolveDir.replaceAll('\\', '/');
      // Only our own source modules import the shared context relatively.
      if (resolveDir.includes('/src/lib')) {
        return { path: SHARED_CONTEXT, external: true };
      }
    });
  },
};

// Each entry is built as its OWN tsup pass into its OWN subfolder. Two payoffs:
//  1. The .d.ts bundler (rollup-plugin-dts) never code-splits shared types into
//     a hashed chunk — every entry's declarations are self-contained. Type defs
//     may duplicate across folders (harmless, structural); the ONE thing that
//     must be a single instance — the contexts — is shared at runtime via the
//     plugin above.
//  2. Because each entry owns its folder, every pass can `clean: true` safely
//     without clobbering a sibling entry's output.
const shared: Options = {
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Don't code-split JS: each entry is self-contained. The shared contexts are
  // handled by the plugin (external), not by splitting, so CJS and ESM match.
  splitting: false,
  minify: true,
  sourcemap: true,
  target: 'es2019',
  external: ['react', 'react-dom', 'zod', SHARED_CONTEXT],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  esbuildPlugins: [sharedContextPlugin],
};

// Output basename is `index` in each folder, so `./core/index.js` etc.
export default defineConfig([
  // Core (`.`) — DOM-free, RN friendly.
  { ...shared, entry: { index: 'src/lib/index.ts' }, outDir: 'dist_module/core' },
  // Opt-in web debug tooling (DOM).
  {
    ...shared,
    entry: { index: 'src/lib/devtools.ts' },
    outDir: 'dist_module/devtools',
  },
  // Shared contexts — their own entry so they stay a single instance.
  {
    ...shared,
    entry: { index: 'src/lib/context.ts' },
    outDir: 'dist_module/context',
  },
]);
