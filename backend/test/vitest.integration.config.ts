import { defineConfig } from 'vitest/config';

// The foundation suite only pulls public test images. Avoid inheriting a local
// credential store that may be configured but have no Docker Hub credential.
process.env.DOCKER_AUTH_CONFIG ??= JSON.stringify({ auths: {} });

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 120_000,
    include: ['test/**/*.integration.spec.ts'],
    testTimeout: 30_000,
  },
});
