import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { OutboxWorker } from './modules/notifications/outbox.worker.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);

  await app.get(OutboxWorker).runOnce();
}

void bootstrap();
