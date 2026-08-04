import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppEnv } from '../../config/env.js';
import { DatabaseService } from '../../database/database.service.js';
import {
  orders,
  type OutboxEvent,
  users,
} from '../../database/schema/index.js';

const userRegisteredPayloadSchema = z.object({ userId: z.uuid() }).strict();
const orderAcceptedPayloadSchema = z.object({ orderId: z.uuid() }).strict();

@Injectable()
export class NotificationDeliveryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async deliver(event: OutboxEvent): Promise<void> {
    if (event.type === 'user.registered') {
      await this.deliverRegistration(event);
      return;
    }

    if (event.type === 'order.accepted') {
      await this.deliverOrderAccepted(event);
      return;
    }

    throw new Error(`Unsupported outbox event type: ${event.type}`);
  }

  private async deliverRegistration(event: OutboxEvent): Promise<void> {
    const payload = userRegisteredPayloadSchema.safeParse(event.payload);

    if (!payload.success) {
      throw new Error('Invalid user.registered outbox payload.');
    }

    const records = await this.database.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, payload.data.userId))
      .limit(1);
    const user = records[0];

    if (!user) {
      throw new Error('Registered user was not found.');
    }

    await this.sendEmail({
      to: user.email,
      subject: 'Вы успешно зарегистрированы',
      text: 'Вы успешно зарегистрированы на сайте туристических товаров.',
      idempotencyKey: `${event.idempotencyKey}:email`,
    });
  }

  private async deliverOrderAccepted(event: OutboxEvent): Promise<void> {
    const payload = orderAcceptedPayloadSchema.safeParse(event.payload);

    if (!payload.success) {
      throw new Error('Invalid order.accepted outbox payload.');
    }

    const records = await this.database.db
      .select({
        id: orders.id,
        email: orders.email,
        productTitle: orders.productTitle,
        productType: orders.productType,
      })
      .from(orders)
      .where(eq(orders.id, payload.data.orderId))
      .limit(1);
    const order = records[0];

    if (!order) {
      throw new Error('Accepted order was not found.');
    }

    await this.sendEmail({
      to: order.email,
      subject: 'Мы взяли ваш заказ в работу',
      text: `Мы взяли ваш заказ «${order.productTitle}» в работу. Наш менеджер свяжется с вами по телефону, чтобы обсудить детали.`,
      idempotencyKey: `${event.idempotencyKey}:email`,
    });
    await this.sendSlack({
      text: `Новая заявка ${order.id}: ${order.productTitle} (${order.productType}). Откройте заявку во внешней админке для контактов и деталей.`,
    });
  }

  private async sendEmail(input: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<void> {
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true });
    const from = this.config.get('RESEND_FROM', { infer: true });

    if (!apiKey || !from) {
      throw new Error('Resend notification configuration is missing.');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Resend email delivery failed with status ${response.status}.`,
      );
    }
  }

  private async sendSlack(input: { text: string }): Promise<void> {
    const webhookUrl = this.config.get('SLACK_WEBHOOK_URL', { infer: true });

    if (!webhookUrl) {
      throw new Error('Slack notification configuration is missing.');
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(
        `Slack notification delivery failed with status ${response.status}.`,
      );
    }
  }
}
