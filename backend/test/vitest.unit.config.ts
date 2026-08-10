import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['test/setup-env.ts'],
    exclude: ['test/**/*.integration.spec.ts'],
    include: ['test/**/*.spec.ts'],
  },
});
