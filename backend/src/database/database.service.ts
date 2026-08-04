import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { AppEnv } from '../config/env.js';
import * as schema from './schema/index.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly db: NodePgDatabase<typeof schema>;
  private readonly pool: Pool;

  constructor(config: ConfigService<AppEnv, true>) {
    this.pool = new Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
    });
    this.db = drizzle(this.pool, { schema });
  }

  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
