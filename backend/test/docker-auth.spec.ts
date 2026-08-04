import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const backendRoot = resolve(import.meta.dirname, '..');
const inspectAuthScript = [
  "await import('./test/vitest.integration.config.ts');",
  "process.stdout.write(process.env.DOCKER_AUTH_CONFIG ?? 'unset');",
].join(' ');

type DockerConfigFixture = Readonly<{
  config?: Record<string, unknown>;
  configLocation?: 'default' | 'explicit';
  dockerAuthConfig?: string;
  workingDesktopHelper?: boolean;
}>;

function inspectConfiguredAuth(fixture: DockerConfigFixture): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'turkiye-docker-auth-'));
  const home = join(fixtureRoot, 'home');
  const binaryDirectory = join(fixtureRoot, 'bin');
  mkdirSync(home);
  mkdirSync(binaryDirectory);

  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      PATH: binaryDirectory,
    };
    delete env.DOCKER_AUTH_CONFIG;
    delete env.DOCKER_CONFIG;

    if (fixture.dockerAuthConfig !== undefined) {
      env.DOCKER_AUTH_CONFIG = fixture.dockerAuthConfig;
    }

    if (fixture.config !== undefined) {
      const configDirectory =
        fixture.configLocation === 'explicit'
          ? join(fixtureRoot, 'docker-config')
          : join(home, '.docker');
      mkdirSync(configDirectory);
      writeFileSync(
        join(configDirectory, 'config.json'),
        JSON.stringify(fixture.config),
      );

      if (fixture.configLocation === 'explicit') {
        env.DOCKER_CONFIG = configDirectory;
      }
    }

    if (fixture.workingDesktopHelper === true) {
      const helperPath = join(binaryDirectory, 'docker-credential-desktop');
      writeFileSync(
        helperPath,
        [
          '#!/bin/sh',
          'read -r registry',
          'if [ "$registry" != "https://index.docker.io/v1/" ]; then',
          '  exit 1',
          'fi',
          'printf \'%s\' \'{"ServerURL":"https://index.docker.io/v1/","Username":"test","Secret":"test"}\'',
          '',
        ].join('\n'),
      );
      chmodSync(helperPath, 0o700);
    }

    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', inspectAuthScript],
      {
        cwd: backendRoot,
        encoding: 'utf8',
        env,
      },
    );

    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
}

describe('integration Docker authentication', () => {
  it('preserves an explicit DOCKER_AUTH_CONFIG', () => {
    const configuredAuth = '{"auths":{"registry.example":{"auth":"test"}}}';

    expect(inspectConfiguredAuth({ dockerAuthConfig: configuredAuth })).toBe(
      configuredAuth,
    );
  });

  it('leaves an explicit DOCKER_CONFIG authoritative', () => {
    expect(
      inspectConfiguredAuth({
        config: { auths: { 'registry.example': { auth: 'test' } } },
        configLocation: 'explicit',
      }),
    ).toBe('unset');
  });

  it('preserves file-based registry auth in the default Docker config', () => {
    expect(
      inspectConfiguredAuth({
        config: { auths: { 'registry.example': { auth: 'test' } } },
        configLocation: 'default',
      }),
    ).toBe('unset');
  });

  it('preserves a working Docker Desktop credential store', () => {
    expect(
      inspectConfiguredAuth({
        config: { auths: {}, credsStore: 'desktop' },
        configLocation: 'default',
        workingDesktopHelper: true,
      }),
    ).toBe('unset');
  });

  it('uses anonymous public auth only for an empty broken local Desktop store', () => {
    expect(
      inspectConfiguredAuth({
        config: { auths: {}, credsStore: 'desktop' },
        configLocation: 'default',
      }),
    ).toBe('{"auths":{}}');
  });
});
