import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { parseEnv } from '../config/env.js';

export async function runMigrations(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url });

  try {
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  } finally {
    await pool.end();
  }
}

const entrypoint = process.argv[1];

if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(entrypoint).href
) {
  const env = parseEnv(process.env);
  await runMigrations(env.DATABASE_URL);
}
