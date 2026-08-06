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
import {
  categories,
  orders,
  outboxEvents,
  products,
  users,
} from '../src/database/schema/index.js';
import type { OutboxRepository } from '../src/modules/notifications/outbox.repository.js';
import type { OutboxWorker } from '../src/modules/notifications/outbox.worker.js';
import { startPostgres } from './support/postgres.js';

const execFileAsync = promisify(execFile);
const backendDirectory = fileURLToPath(new URL('..', import.meta.url));

describe('outbox worker foundation', () => {
  const previousEnv = {
    databaseUrl: process.env.DATABASE_URL,
    adminApiKey: process.env.ADMIN_API_KEY,
    logLevel: process.env.LOG_LEVEL,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    resendApiKey: process.env.RESEND_API_KEY,
    resendFrom: process.env.RESEND_FROM,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
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
    process.env.ADMIN_API_KEY = 'test-static-admin-key';
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM = 'Turkey <noreply@example.test>';
    process.env.SLACK_WEBHOOK_URL = 'https://slack.example.test/hooks/orders';

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
    restoreEnvironment('ADMIN_API_KEY', previousEnv.adminApiKey);
    restoreEnvironment('LOG_LEVEL', previousEnv.logLevel);
    restoreEnvironment('NODE_ENV', previousEnv.nodeEnv);
    restoreEnvironment('PORT', previousEnv.port);
    restoreEnvironment('RESEND_API_KEY', previousEnv.resendApiKey);
    restoreEnvironment('RESEND_FROM', previousEnv.resendFrom);
    restoreEnvironment('SLACK_WEBHOOK_URL', previousEnv.slackWebhookUrl);
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

  it('sends a registration email once and marks its event delivered', async () => {
    const [user] = await database.db
      .insert(users)
      .values({
        email: 'new-user@example.test',
        passwordHash: 'not-used-by-notification-worker',
      })
      .returning();
    expect(user).toBeDefined();
    await repository.enqueue({
      type: 'user.registered',
      aggregateId: user!.id,
      idempotencyKey: `user.registered:${user!.id}`,
      payload: { userId: user!.id },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }),
      );

    try {
      await expect(worker.runOnce()).resolves.toBe(1);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Idempotency-Key': `user.registered:${user!.id}:email`,
          }),
        }),
      );
      const [persisted] = await database.db
        .select({ deliveredAt: outboxEvents.deliveredAt })
        .from(outboxEvents)
        .where(eq(outboxEvents.idempotencyKey, `user.registered:${user!.id}`));
      expect(persisted?.deliveredAt).toBeInstanceOf(Date);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('sends email and Slack exactly once for an accepted order', async () => {
    const [user] = await database.db
      .insert(users)
      .values({
        email: 'booking-owner@example.test',
        passwordHash: 'not-used-by-notification-worker',
      })
      .returning();
    const [category] = await database.db
      .insert(categories)
      .values({ name: 'Бронь', slug: 'worker-booking-category' })
      .returning();
    const [product] = await database.db
      .insert(products)
      .values({
        categoryId: category!.id,
        title: 'Аренда яхты',
        slug: 'worker-yacht-rental',
        description: 'Тестовая заявка на аренду яхты.',
        type: 'booking',
      })
      .returning();
    const [order] = await database.db
      .insert(orders)
      .values({
        userId: user!.id,
        productId: product!.id,
        idempotencyKey: randomUUID(),
        productTitle: product!.title,
        productType: product!.type,
        email: 'guest-booking@example.test',
        phone: '+905551112233',
        bookingStartDate: '2026-09-10',
        bookingEndDate: '2026-09-12',
      })
      .returning();
    await repository.enqueue({
      type: 'order.accepted',
      aggregateId: order!.id,
      idempotencyKey: `order.accepted:${order!.id}`,
      payload: { orderId: order!.id },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    try {
      await expect(worker.runOnce()).resolves.toBe(1);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        'https://api.resend.com/emails',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': `order.accepted:${order!.id}:email`,
          }),
        }),
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        'https://slack.example.test/hooks/orders',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(order!.id),
        }),
      );
      const [persisted] = await database.db
        .select({ deliveredAt: outboxEvents.deliveredAt })
        .from(outboxEvents)
        .where(eq(outboxEvents.idempotencyKey, `order.accepted:${order!.id}`));
      expect(persisted?.deliveredAt).toBeInstanceOf(Date);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('does not fake delivery when a notification event cannot be handled', async () => {
    await repository.enqueue({
      type: 'unsupported.event',
      aggregateId: randomUUID(),
      idempotencyKey: 'unsupported.event:worker-order',
      payload: { orderId: 'worker-order' },
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('worker attempted a network request'));

    try {
      await expect(worker.runOnce()).resolves.toBe(1);

      expect(fetchSpy).not.toHaveBeenCalled();
      const [persisted] = await database.db
        .select({
          claimToken: outboxEvents.claimToken,
          deliveredAt: outboxEvents.deliveredAt,
        })
        .from(outboxEvents)
        .where(
          eq(outboxEvents.idempotencyKey, 'unsupported.event:worker-order'),
        );
      expect(persisted?.claimToken).toBeNull();
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
