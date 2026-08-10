import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.js';
import { CatalogMediaCleanupService } from './modules/media/catalog-media-cleanup.service.js';
import { OutboxWorker } from './modules/notifications/outbox.worker.js';

const MEDIA_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const config = app.get(ConfigService<AppEnv, true>);
  const worker = app.get(OutboxWorker);
  const mediaCleanup = app.get(CatalogMediaCleanupService);
  const logger = new Logger('Worker');

  try {
    if (config.get('NODE_ENV', { infer: true }) === 'test') {
      await worker.runOnce();
      return;
    }

    const pollIntervalMs = config.get('WORKER_POLL_INTERVAL_MS', {
      infer: true,
    });
    let stopping = false;
    let nextMediaCleanupAt = 0;
    const stop = () => {
      stopping = true;
    };

    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    while (!stopping) {
      if (Date.now() >= nextMediaCleanupAt) {
        try {
          await mediaCleanup.runOnce();
        } catch (error) {
          logger.error({
            message:
              error instanceof Error
                ? error.message
                : 'Unknown catalog media cleanup error.',
          });
        } finally {
          nextMediaCleanupAt = Date.now() + MEDIA_CLEANUP_INTERVAL_MS;
        }
      }
      await worker.runOnce();
      await waitForNextPoll(pollIntervalMs, () => stopping);
    }

    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  } finally {
    await app.close();
  }
}

function waitForNextPoll(intervalMs: number, isStopping: () => boolean) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearInterval(stopTimer);
      clearTimeout(pollTimer);
      resolve();
    };
    const stopTimer = setInterval(
      () => {
        if (!isStopping()) return;
        finish();
      },
      Math.min(intervalMs, 250),
    );
    const pollTimer = setTimeout(finish, intervalMs);
  });
}

void bootstrap();
