import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/database/migrate.js';
import { startPostgres } from './support/postgres.js';

describe('database migrations', () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let postgres: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    postgres = await startPostgres();
    process.env.DATABASE_URL = postgres.getConnectionUri();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    await runMigrations(process.env.DATABASE_URL);
  });

  afterAll(async () => {
    await pool?.end();
    await postgres?.stop();

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });

  it('creates outbox_events on a clean PostgreSQL database', async () => {
    const result = await pool.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'outbox_events'",
    );

    expect(result.rows).toHaveLength(1);
  });

  it('creates catalog, audit, account, and security tables on a clean PostgreSQL database', async () => {
    const result = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('auth_rate_limits', 'categories', 'products', 'audit_log', 'users', 'sessions') order by table_name",
    );

    expect(result.rows).toEqual([
      { table_name: 'audit_log' },
      { table_name: 'auth_rate_limits' },
      { table_name: 'categories' },
      { table_name: 'products' },
      { table_name: 'sessions' },
      { table_name: 'users' },
    ]);
  });

  it('creates the scenario marker required by the orders schema', async () => {
    const result = await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'is_scenario'",
    );

    expect(result.rows).toEqual([{ column_name: 'is_scenario' }]);
  });
});
