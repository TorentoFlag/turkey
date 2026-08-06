import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { AppEnv } from './config/env.js';
import { OutboxWorker } from './modules/notifications/outbox.worker.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const config = app.get(ConfigService<AppEnv, true>);
  const worker = app.get(OutboxWorker);

  try {
    if (config.get('NODE_ENV', { infer: true }) === 'test') {
      await worker.runOnce();
      return;
    }

    const pollIntervalMs = config.get('WORKER_POLL_INTERVAL_MS', {
      infer: true,
    });
    let stopping = false;
    const stop = () => {
      stopping = true;
    };

    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    while (!stopping) {
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
