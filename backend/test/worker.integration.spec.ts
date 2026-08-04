import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
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

const execFileAsync = promisify(execFile);
const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

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
    expect(claimed[0]?.claimToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    await expect(
      repository.markDelivered(claimed[0]!.id, claimed[0]!.claimToken),
    ).resolves.toBe(true);
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
    expect(claimed[0]?.claimToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    await repository.markDelivered(claimed[0]!.id, claimed[0]!.claimToken);
  });

  it('claims multiple due events in creation order', async () => {
    const eventIds = ['ordered-third', 'ordered-first', 'ordered-second'];

    for (const eventId of eventIds) {
      await repository.enqueue({
        type: 'order.accepted',
        aggregateId: randomUUID(),
        idempotencyKey: `order.accepted:${eventId}`,
        payload: { orderId: eventId },
      });
    }

    const creationTimes = new Map([
      ['ordered-first', new Date('2026-01-01T00:00:01.000Z')],
      ['ordered-second', new Date('2026-01-01T00:00:02.000Z')],
      ['ordered-third', new Date('2026-01-01T00:00:03.000Z')],
    ]);

    for (const [eventId, createdAt] of creationTimes) {
      await database.db
        .update(outboxEvents)
        .set({ createdAt })
        .where(eq(outboxEvents.idempotencyKey, `order.accepted:${eventId}`));
    }

    const claimed = await repository.claimPending(3);

    expect(claimed.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      'order.accepted:ordered-first',
      'order.accepted:ordered-second',
      'order.accepted:ordered-third',
    ]);

    for (const event of claimed) {
      await repository.markDelivered(event.id, event.claimToken);
    }
  });

  it('excludes an event whose next attempt is in the future', async () => {
    await repository.enqueue({
      type: 'order.accepted',
      aggregateId: randomUUID(),
      idempotencyKey: 'order.accepted:future-order',
      payload: { orderId: 'future-order' },
    });
    await database.db
      .update(outboxEvents)
      .set({ nextAttemptAt: new Date('2099-01-01T00:00:00.000Z') })
      .where(eq(outboxEvents.idempotencyKey, 'order.accepted:future-order'));

    await expect(repository.claimPending(10)).resolves.toEqual([]);
  });

  it('reclaims an expired lease and fences stale or repeated delivery marks', async () => {
    await repository.enqueue({
      type: 'order.accepted',
      aggregateId: randomUUID(),
      idempotencyKey: 'order.accepted:reclaimed-order',
      payload: { orderId: 'reclaimed-order' },
    });

    const [firstClaim] = await repository.claimPending(1);
    expect(firstClaim?.claimToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    await database.db
      .update(outboxEvents)
      .set({ nextAttemptAt: new Date('2000-01-01T00:00:00.000Z') })
      .where(eq(outboxEvents.id, firstClaim!.id));
    await expect(
      repository.markDelivered(firstClaim!.id, firstClaim!.claimToken),
    ).resolves.toBe(false);

    const [secondClaim] = await repository.claimPending(1);
    expect(secondClaim).toMatchObject({ id: firstClaim!.id, attempts: 2 });
    expect(secondClaim?.claimToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(secondClaim?.claimToken).not.toBe(firstClaim!.claimToken);

    await expect(
      repository.markDelivered(firstClaim!.id, firstClaim!.claimToken),
    ).resolves.toBe(false);
    await expect(
      repository.markDelivered(secondClaim!.id, secondClaim!.claimToken),
    ).resolves.toBe(true);
    await expect(
      repository.markDelivered(secondClaim!.id, secondClaim!.claimToken),
    ).resolves.toBe(false);

    const [persisted] = await database.db
      .select({
        claimToken: outboxEvents.claimToken,
        deliveredAt: outboxEvents.deliveredAt,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.id, secondClaim!.id));
    expect(persisted?.claimToken).toBeNull();
    expect(persisted?.deliveredAt).toBeInstanceOf(Date);
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
        .select({
          claimToken: outboxEvents.claimToken,
          deliveredAt: outboxEvents.deliveredAt,
        })
        .from(outboxEvents)
        .where(eq(outboxEvents.idempotencyKey, 'order.accepted:worker-order'));
      expect(persisted?.claimToken).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(persisted?.deliveredAt).toBeNull();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('closes its Nest context and exits after one worker pass', async () => {
    await expect(
      execFileAsync(process.execPath, ['--import', 'tsx', 'src/worker.ts'], {
        cwd: backendDirectory,
        env: process.env,
        timeout: 10_000,
      }),
    ).resolves.toMatchObject({ stderr: '' });
  });
});

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
