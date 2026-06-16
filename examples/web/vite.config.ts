import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/form-context-react-zod/', // GitHub repo name
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // `form-context-react-zod` is a `file:` symlink to ../../dist_module. Vite
    // pre-bundles deps and caches them keyed off package.json/lockfile, NOT the
    // linked package's contents — so without excluding it, a `build:lib` rebuild
    // gets masked by the stale .vite cache even after a restart. Excluding it
    // makes Vite serve it straight from the symlink, so rebuild + refresh works.
    exclude: ['lucide-react', 'form-context-react-zod'],
  },
});
