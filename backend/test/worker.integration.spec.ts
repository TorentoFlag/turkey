import { randomUUID } from 'node:crypto';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service.js';
import { runMigrations } from '../src/database/migrate.js';
import { outboxEvents } from '../src/database/schema/index.js';
import type { OutboxRepository } from '../src/modules/notifications/outbox.repository.js';
import type { OutboxWorker } from '../src/modules/notifications/outbox.worker.js';
import { startPostgres } from './support/postgres.js';

describe('outbox worker foundation', () => {
  const previousEnv = {
    databaseUrl: process.env.DATABASE_URL,
    logLevel: process.env.LOG_LEVEL,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
  };
  let app: INestApplicationContext;
  let postgres: StartedPostgreSqlContainer;
  let database: DatabaseService;
  let repository: OutboxRepository;
  let worker: OutboxWorker;

  beforeAll(async () => {
    postgres = await startPostgres();
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.DATABASE_URL = postgres
      .getConnectionUri()
      .replace(/^postgres:/, 'postgresql:');
    process.env.LOG_LEVEL = 'warn';

    await runMigrations(process.env.DATABASE_URL);

    const [{ AppModule }, { OutboxRepository }, { OutboxWorker }] =
      await Promise.all([
        import('../src/app.module.js'),
        import('../src/modules/notifications/outbox.repository.js'),
        import('../src/modules/notifications/outbox.worker.js'),
      ]);

    app = await NestFactory.createApplicationContext(
      AppModule as Type<unknown>,
      { logger: false },
    );
    repository = app.get(OutboxRepository);
    worker = app.get(OutboxWorker);
    database = app.get(DatabaseService);
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();

    restoreEnvironment('DATABASE_URL', previousEnv.databaseUrl);
    restoreEnvironment('LOG_LEVEL', previousEnv.logLevel);
    restoreEnvironment('NODE_ENV', previousEnv.nodeEnv);
    restoreEnvironment('PORT', previousEnv.port);
  });

  it('ignores a duplicate idempotency key deterministically', async () => {
    const event = {
      type: 'order.accepted',
      aggregateId: randomUUID(),
      idempotencyKey: 'order.accepted:test-order',
      payload: { orderId: 'test-order' },
    } as const;

    await repository.enqueue(event);
    await repository.enqueue(event);

    const claimed = await repository.claimPending(10);

    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      type: 'order.accepted',
      idempotencyKey: 'order.accepted:test-order',
      attempts: 1,
      payload: { orderId: 'test-order' },
    });

    await repository.markDelivered(claimed[0]!.id);
    await expect(repository.claimPending(10)).resolves.toEqual([]);
  });

  it('allows only one concurrent claimant to receive a due event', async () => {
    await repository.enqueue({
      type: 'order.accepted',
      aggregateId: randomUUID(),
      idempotencyKey: 'order.accepted:concurrent-order',
      payload: { orderId: 'concurrent-order' },
    });

    const claims = await Promise.all([
      repository.claimPending(1),
      repository.claimPending(1),
    ]);
    const claimed = claims.flat();

    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.attempts).toBe(1);

    await repository.markDelivered(claimed[0]!.id);
  });

  it('runs once without making a network request or faking delivery', async () => {
    await repository.enqueue({
      type: 'order.accepted',
      aggregateId: randomUUID(),
      idempotencyKey: 'order.accepted:worker-order',
      payload: { orderId: 'worker-order' },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('worker attempted a network request'));

    try {
      await worker.runOnce();

      expect(fetchSpy).not.toHaveBeenCalled();
      const [persisted] = await database.db
        .select({ deliveredAt: outboxEvents.deliveredAt })
        .from(outboxEvents)
        .where(eq(outboxEvents.idempotencyKey, 'order.accepted:worker-order'));
      expect(persisted?.deliveredAt).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
