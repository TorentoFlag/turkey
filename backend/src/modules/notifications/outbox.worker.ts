import { Injectable, Logger } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository.js';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  constructor(private readonly repository: OutboxRepository) {}

  async runOnce(limit = 10): Promise<number> {
    const events = await this.repository.claimPending(limit);

    for (const event of events) {
      this.logger.log({
        outboxEventId: event.id,
        outboxEventType: event.type,
      });
    }

    return events.length;
  }
}
