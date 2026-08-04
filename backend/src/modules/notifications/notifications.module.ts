import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { OutboxRepository } from './outbox.repository.js';
import { OutboxWorker } from './outbox.worker.js';

@Module({
  imports: [DatabaseModule],
  providers: [OutboxRepository, OutboxWorker],
  exports: [OutboxRepository, OutboxWorker],
})
export class NotificationsModule {}
