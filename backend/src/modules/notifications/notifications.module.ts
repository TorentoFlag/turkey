import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { OutboxRepository } from './outbox.repository.js';
import { OutboxWorker } from './outbox.worker.js';

@Module({
  imports: [DatabaseModule],
  providers: [NotificationDeliveryService, OutboxRepository, OutboxWorker],
  exports: [OutboxRepository, OutboxWorker],
})
export class NotificationsModule {}
