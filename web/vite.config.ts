import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'node:path';

export default defineConfig({
  root: '.',
  publicDir: resolve(__dirname, 'public'),
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@homolog/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    open: false,
    host: true,
  },
  preview: {
    port: 4173,
  },
});
