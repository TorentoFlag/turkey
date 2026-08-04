import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

function hasEntries(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function configureBrokenLocalDesktopStoreFallback(): void {
  if (
    process.env.DOCKER_AUTH_CONFIG !== undefined ||
    process.env.DOCKER_CONFIG !== undefined
  ) {
    return;
  }

  let dockerConfig: unknown;

  try {
    dockerConfig = JSON.parse(
      readFileSync(join(homedir(), '.docker', 'config.json'), 'utf8'),
    );
  } catch {
    return;
  }

  if (
    typeof dockerConfig !== 'object' ||
    dockerConfig === null ||
    Array.isArray(dockerConfig) ||
    !('credsStore' in dockerConfig) ||
    dockerConfig.credsStore !== 'desktop' ||
    ('auths' in dockerConfig && hasEntries(dockerConfig.auths)) ||
    ('credHelpers' in dockerConfig && hasEntries(dockerConfig.credHelpers))
  ) {
    return;
  }

  const credential = spawnSync('docker-credential-desktop', ['get'], {
    input: 'https://index.docker.io/v1/\n',
    stdio: ['pipe', 'ignore', 'ignore'],
  });

  if (credential.status !== 0) {
    process.env.DOCKER_AUTH_CONFIG = JSON.stringify({ auths: {} });
  }
}

configureBrokenLocalDesktopStoreFallback();

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 120_000,
    include: ['test/**/*.integration.spec.ts'],
    testTimeout: 30_000,
  },
});
