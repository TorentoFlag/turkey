import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { OutboxRepository } from './outbox.repository.js';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  constructor(
    @Inject(OutboxRepository) private readonly repository: OutboxRepository,
    @Inject(NotificationDeliveryService)
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async runOnce(limit = 10): Promise<number> {
    const events = await this.repository.claimPending(limit);

    for (const event of events) {
      try {
        await this.delivery.deliver(event);
        const delivered = await this.repository.markDelivered(
          event.id,
          event.claimToken,
        );

        if (!delivered) {
          this.logger.warn({
            outboxEventId: event.id,
            outboxEventType: event.type,
            message: 'Outbox delivery lease was lost before acknowledgement.',
          });
        }
      } catch (error) {
        await this.repository.scheduleRetry(
          event.id,
          event.claimToken,
          event.attempts,
        );
        this.logger.error({
          outboxEventId: event.id,
          outboxEventType: event.type,
          message:
            error instanceof Error ? error.message : 'Unknown delivery error.',
        });
      }
    }

    return events.length;
  }
}
