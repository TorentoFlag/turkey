import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
const backendDirectory = fileURLToPath(new URL('..', import.meta.url));
const execFileAsync = promisify(execFile);

describe('db:migrate entrypoint', () => {
  it('loads the local environment file before running the migration module', async () => {
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts['db:migrate']).toContain('--env-file=.env');

    const directory = await mkdtemp(join(tmpdir(), 'turkiye-migration-env-'));
    const envFile = join(directory, '.env');
    await writeFile(
      envFile,
      [
        'NODE_ENV=test',
        'PORT=3001',
        'DATABASE_URL=postgresql://turkiye:turkiye@127.0.0.1:1/turkiye_test',
        'LOG_LEVEL=warn',
      ].join('\n'),
    );

    try {
      await expect(
        execFileAsync(
          process.execPath,
          [
            `--env-file=${envFile}`,
            '--import',
            'tsx',
            'src/database/migrate.ts',
          ],
          {
            cwd: backendDirectory,
            env: { PATH: process.env.PATH ?? '' },
          },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/ECONNREFUSED/),
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
