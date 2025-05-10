import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/lib/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: true,
  target: 'es2019',
  external: ['react', 'react-dom', 'zod'],
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
});
