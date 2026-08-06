import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { AppEnv } from '../../config/env.js';

const arcCurrencies = ['RUB', 'KZT', 'UZS'] as const;

const paymentMethodsSchema = z.array(
  z.object({
    method: z.string().min(1),
    payment_mode: z.enum(['h2h', 'redirect']),
    is_active: z.boolean(),
    supported_currencies: z.array(z.string()).optional(),
  }),
);

const checkoutSessionSchema = z.object({
  id: z.uuid(),
  url: z.string().url(),
});

const refundSchema = z.object({
  id: z.uuid(),
  payment_id: z.uuid(),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  status: z.enum(['pending', 'succeeded', 'failed']),
});

export type CreateArcCheckoutInput = Readonly<{
  amountMinor: number;
  currency: string;
  customerEmail: string;
  description: string;
  externalId: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
}>;

export type ArcCheckoutSession = Readonly<{
  id: string;
  url: string;
}>;

export type ArcRefund = Readonly<{
  id: string;
  status: 'pending' | 'succeeded' | 'failed';
}>;

@Injectable()
export class ArcPayClient {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async createHostedCheckout(
    input: CreateArcCheckoutInput,
  ): Promise<ArcCheckoutSession> {
    const apiKey = this.config.get('ARC_SECRET_API_KEY', { infer: true });

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Payments are temporarily unavailable.',
      );
    }

    if (!isArcCurrency(input.currency)) {
      throw new ServiceUnavailableException(
        'Payments are temporarily unavailable.',
      );
    }

    const environment = apiKey.startsWith('sk_test_') ? 'sandbox' : 'live';
    const methodsResponse = await this.request(
      `payment-methods/available?environment=${environment}`,
      {
        headers: this.authorizationHeaders(apiKey),
        method: 'GET',
      },
    );
    const methods = paymentMethodsSchema.safeParse(methodsResponse);

    if (!methods.success) {
      throw new ServiceUnavailableException(
        'Payments are temporarily unavailable.',
      );
    }

    const paymentMethods = methods.data
      .filter(
        (method) =>
          method.is_active &&
          method.payment_mode === 'redirect' &&
          (method.supported_currencies === undefined ||
            method.supported_currencies.includes(input.currency)),
      )
      .map((method) => ({
        method: method.method,
        payment_mode: method.payment_mode,
      }));

    if (paymentMethods.length === 0) {
      throw new ServiceUnavailableException(
        'Payments are temporarily unavailable.',
      );
    }

    const checkoutResponse = await this.request('checkout/sessions', {
      body: JSON.stringify({
        amount: input.amountMinor,
        capture_mode: 'one_stage',
        currency: input.currency,
        customer_email: input.customerEmail,
        description: input.description,
        external_id: input.externalId,
        metadata: input.metadata,
        payment_methods: paymentMethods,
        success_url: input.successUrl,
        fail_url: input.failUrl,
        cancel_url: input.cancelUrl,
      }),
      headers: {
        ...this.authorizationHeaders(apiKey),
        'content-type': 'application/json',
        'idempotency-key': input.idempotencyKey,
      },
      method: 'POST',
    });
    const checkout = checkoutSessionSchema.safeParse(checkoutResponse);

    if (!checkout.success) {
      throw new ServiceUnavailableException(
        'Payments are temporarily unavailable.',
      );
    }

    return checkout.data;
  }

  async createFullRefund(input: {
    providerPaymentId: string;
    amountMinor: number;
    idempotencyKey: string;
  }): Promise<ArcRefund> {
    const apiKey = this.config.get('ARC_SECRET_API_KEY', { infer: true });

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Refunds are temporarily unavailable.',
      );
    }

    const response = await this.request(
      `payments/${input.providerPaymentId}/refunds`,
      {
        body: JSON.stringify({ amount: input.amountMinor }),
        headers: {
          ...this.authorizationHeaders(apiKey),
          'content-type': 'application/json',
          'idempotency-key': input.idempotencyKey,
        },
        method: 'POST',
      },
    );
    const refund = refundSchema.safeParse(response);

    if (!refund.success) {
      throw new ServiceUnavailableException(
        'Refunds are temporarily unavailable.',
      );
    }

    return { id: refund.data.id, status: refund.data.status };
  }

  private authorizationHeaders(apiKey: string): HeadersInit {
    return { authorization: `Bearer ${apiKey}` };
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(this.url(path), init);
    } catch {
      throw new ServiceUnavailableException(
        'Payments are temporarily unavailable.',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Payments are temporarily unavailable.',
      );
    }

    try {
      return await response.json();
    } catch {
      throw new ServiceUnavailableException(
        'Payments are temporarily unavailable.',
      );
    }
  }

  private url(path: string): string {
    const baseUrl = this.config.get('ARC_API_BASE_URL', { infer: true });
    return new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString();
  }
}

function isArcCurrency(value: string): value is (typeof arcCurrencies)[number] {
  return arcCurrencies.includes(value as (typeof arcCurrencies)[number]);
}
