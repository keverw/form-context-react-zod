import { defineConfig, type Options } from 'tsup';
import type { Plugin } from 'esbuild';

// The published subpath the shared contexts resolve to at runtime.
const SHARED_CONTEXT = 'form-context-react-zod/context';

// ---------------------------------------------------------------------------
// Shared-context singleton (the whole reason this build is multi-entry-aware).
//
// `src/context.ts` creates the two React contexts (FormContext +
// FormFieldContext) and is its OWN published entry (`./context`) — the single
// home for those context instances. Every OTHER entry only *uses* them: `.`
// (core), `./web`, `./devtools/web`, and `./devtools/native`. In source those
// entries import context.ts relatively (`./context` from src, `../context`
// from src/hooks).
//
// The trap: if esbuild inlined context.ts into each bundle, every entry — core
// included — would get its OWN createContext() result, and a consumer reading the
// context (FormState, useField) would see `null` instead of the value
// FormProvider published, because they'd be looking at different context objects.
//
// So we rewrite those relative imports to the EXTERNAL subpath
// `form-context-react-zod/context`. No entry bundles the contexts (not even
// core); they all import the one published `./context` module, so there is
// exactly one instance. This is a runtime JS singleton concern (esbuild), not a
// type concern — the `.d.ts` side is structural, so duplicated declarations stay
// compatible.
// Mirrors unirend's tsup.config.ts (keverw/unirend).
const sharedContextPlugin: Plugin = {
  name: 'externalize-shared-context',
  setup(build) {
    // Matches the relative specifiers `./context` and `../context`.
    build.onResolve({ filter: /^\.\.?\/context$/ }, (args) => {
      if (args.kind === 'entry-point') return; // building context.ts itself

      const resolveDir = args.resolveDir.replaceAll('\\', '/');
      // Only our own source modules import the shared context relatively.
      // Match the dir boundary (`/src` or `/src/...`) so a sibling like
      // `src-extra` can't accidentally match.
      if (/\/src(\/|$)/.test(resolveDir)) {
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
  // ESM-only. The split-context architecture below would support emitting CJS
  // too, but we intentionally publish only ESM.
  format: ['esm'],
  dts: true,
  clean: true,
  // Don't code-split JS: each entry is self-contained. The shared contexts are
  // handled by the plugin (external), not by splitting.
  splitting: false,
  minify: true,
  sourcemap: true,
  target: 'es2019',
  external: ['react', 'react-dom', 'react-native', 'zod', SHARED_CONTEXT],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  esbuildPlugins: [sharedContextPlugin],
};

// Output basename is `index` in each folder, so `./core/index.js` etc.
export default defineConfig([
  // Core (`.`) — DOM-free, RN friendly. FormProvider renders no host elements.
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    outDir: 'dist_module/core',
  },
  // Web (`./web`) — core + a FormProvider that adds the opt-in <form> element.
  { ...shared, entry: { index: 'src/web.ts' }, outDir: 'dist_module/web' },
  // Opt-in debug tooling — symmetric web/native subpaths. Each is its own
  // subfolder of dist_module/devtools/, so the two passes' `clean` don't collide.
  {
    ...shared,
    entry: { index: 'src/devtools/web.ts' },
    outDir: 'dist_module/devtools/web',
  },
  {
    ...shared,
    entry: { index: 'src/devtools/native.ts' },
    outDir: 'dist_module/devtools/native',
  },
  // Shared contexts — their own entry so they stay a single instance.
  {
    ...shared,
    entry: { index: 'src/context.ts' },
    outDir: 'dist_module/context',
  },
]);
