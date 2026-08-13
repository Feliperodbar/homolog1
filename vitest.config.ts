/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'web/src/**/*.{test,spec}.{ts,tsx,js}',
      'shared/src/**/*.{test,spec}.{ts,tsx,js}',
      'tests/**/*.{test,spec}.{ts,tsx,js}',
    ],
    exclude: ['node_modules', 'dist', 'dist-types', 'legacy'],
    clearMocks: true,
    restoreMocks: true,
  },
});
