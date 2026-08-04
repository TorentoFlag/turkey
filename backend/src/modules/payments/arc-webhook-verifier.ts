import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../config/env.js';

const maxTimestampSkewSeconds = 300;

@Injectable()
export class ArcWebhookVerifier {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  verify(input: {
    eventId: string | undefined;
    rawBody: Buffer;
    signature: string | undefined;
    timestamp: string | undefined;
  }): boolean {
    const secret = this.config.get('ARC_WEBHOOK_SECRET', { infer: true });

    if (!secret || !input.eventId || !input.signature || !input.timestamp) {
      return false;
    }

    const signatureParts = input.signature.split(',');
    const signatureTimestamp = signatureParts
      .find((part) => part.startsWith('t='))
      ?.slice(2);
    const candidates = signatureParts
      .filter((part) => part.startsWith('v1='))
      .map((part) => part.slice(3))
      .filter((candidate) => /^[0-9a-f]{64}$/i.test(candidate));

    if (signatureTimestamp !== input.timestamp || candidates.length === 0) {
      return false;
    }

    const timestamp = Number(input.timestamp);

    if (
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Date.now() / 1_000 - timestamp) > maxTimestampSkewSeconds
    ) {
      return false;
    }

    const expected = createHmac('sha256', secret)
      .update(
        Buffer.concat([
          Buffer.from(`${input.eventId}.${timestamp}.`),
          input.rawBody,
        ]),
      )
      .digest();

    return candidates.some((candidate) => {
      const actual = Buffer.from(candidate, 'hex');
      return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
      );
    });
  }
}
