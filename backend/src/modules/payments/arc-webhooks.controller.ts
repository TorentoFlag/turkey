import {
  Controller,
  Body,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ArcWebhookVerifier } from './arc-webhook-verifier.js';
import { PaymentsService } from './payments.service.js';

@Controller('v1/webhooks')
export class ArcWebhooksController {
  constructor(
    private readonly verifier: ArcWebhookVerifier,
    private readonly payments: PaymentsService,
  ) {}

  @Post('arc')
  @HttpCode(204)
  async receive(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Body() body: unknown,
    @Headers('webhook-id') webhookId: string | undefined,
    @Headers('webhook-signature') signature: string | undefined,
    @Headers('webhook-timestamp') timestamp: string | undefined,
  ): Promise<void> {
    const rawBody = Buffer.isBuffer(body) ? body : request.rawBody;

    if (
      !rawBody ||
      !this.verifier.verify({
        eventId: webhookId,
        rawBody,
        signature,
        timestamp,
      })
    ) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    await this.payments.applyArcWebhook({ rawBody, webhookId: webhookId! });
  }
}
