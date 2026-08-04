import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
const backendDirectory = fileURLToPath(new URL('..', import.meta.url));
const localEnvPath = join(backendDirectory, '.env');
const execFileAsync = promisify(execFile);

describe('db:migrate entrypoint', () => {
  it('uses externally supplied configuration when the local environment file is absent', async () => {
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['db:migrate']).toContain(
      '--env-file-if-exists=.env',
    );

    const backupPath = join(
      backendDirectory,
      `.env.migrate-entrypoint-backup-${randomUUID()}`,
    );
    const hasLocalEnv = await exists(localEnvPath);

    try {
      if (hasLocalEnv) {
        await rename(localEnvPath, backupPath);
      }

      await expect(
        execFileAsync('npm', ['run', 'db:migrate'], {
          cwd: backendDirectory,
          env: {
            NODE_ENV: 'test',
            PORT: '3001',
            DATABASE_URL:
              'postgresql://turkiye:turkiye@127.0.0.1:1/turkiye_test',
            LOG_LEVEL: 'warn',
            PATH: process.env.PATH ?? '',
          },
        }),
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/ECONNREFUSED/),
      });
    } finally {
      if (hasLocalEnv) {
        await rename(backupPath, localEnvPath);
      }
    }
  });
});

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
