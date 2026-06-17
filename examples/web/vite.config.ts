import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/form-context-react-zod/', // GitHub repo name
  plugins: [react(), tailwindcss()],
  resolve: {
    // `form-context-react-zod` is a `file:` SYMLINK to ../../dist_module, and the
    // library externalizes react — so its bare `import 'react'` resolves up from
    // /dist_module to the REPO-ROOT node_modules/react, a different physical copy
    // than examples/web/node_modules/react. The dev server's pre-bundling collapses
    // them, but the production (Rollup) build keeps BOTH, giving two React instances
    // and a null hook dispatcher ("Cannot read properties of null (reading 'useMemo')")
    // on the deployed GitHub Pages bundle. Dedupe forces every react/react-dom
    // specifier to a single copy (the app's), matching the dev behavior.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // `form-context-react-zod` is a `file:` symlink to ../../dist_module. Vite
    // pre-bundles deps and caches them keyed off package.json/lockfile, NOT the
    // linked package's contents — so without excluding it, a `build:lib` rebuild
    // gets masked by the stale .vite cache even after a restart. Excluding it
    // makes Vite serve it straight from the symlink, so rebuild + refresh works.
    exclude: ['lucide-react', 'form-context-react-zod'],
  },
});
