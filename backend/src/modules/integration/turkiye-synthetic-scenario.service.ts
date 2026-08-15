import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../config/env.js';
import { OrdersService } from '../orders/orders.service.js';
import { PaymentsService } from '../payments/payments.service.js';

export type TurkiyeSyntheticScenarioResult = Readonly<{
  status: 'healthy' | 'down';
  summary: string;
  error: string | null;
  payment: Readonly<{ reached: boolean }>;
  syntheticEntities: readonly Readonly<{
    type: string;
    externalId: string;
    cleanupStatus: 'cancelled' | 'failed';
  }>[];
  steps: readonly Readonly<Record<string, unknown>>[];
  artifacts: readonly Readonly<Record<string, unknown>>[] | null;
  metadata: Readonly<Record<string, unknown>> | null;
}>;

@Injectable()
export class TurkiyeSyntheticScenarioService {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  async runCheckoutPaymentReached(): Promise<TurkiyeSyntheticScenarioResult> {
    if (!this.paymentCheckoutConfigured()) {
      return notConfiguredResult('payment_provider_not_configured');
    }

    let scenario: Awaited<ReturnType<OrdersService['createScenarioOrder']>>;
    try {
      scenario = await this.orders.createScenarioOrder();
    } catch (error) {
      if (error instanceof BadRequestException) {
        return notConfiguredResult('payable_product_not_configured');
      }
      throw error;
    }

    try {
      const checkout = await this.payments.createCheckout(
        scenario,
        scenario.orderId,
      );
      const checkoutUrl = new URL(checkout.checkoutUrl);
      await this.orders.cleanupScenarioOrder(scenario.orderId);
      return {
        status: 'healthy',
        summary: 'Synthetic checkout reached hosted payment',
        error: null,
        payment: { reached: true },
        syntheticEntities: [
          {
            type: 'order',
            externalId: scenario.orderId,
            cleanupStatus: 'cancelled',
          },
        ],
        steps: [
          { key: 'create_synthetic_order', status: 'passed' },
          {
            key: 'reach_hosted_payment',
            status: 'passed',
            checkoutUrlHost: checkoutUrl.host,
          },
          { key: 'cleanup_synthetic_order', status: 'passed' },
        ],
        artifacts: null,
        metadata: { checkoutUrlHost: checkoutUrl.host },
      };
    } catch {
      let cleanupStatus: 'cancelled' | 'failed' = 'failed';
      try {
        await this.orders.cleanupScenarioOrder(scenario.orderId);
        cleanupStatus = 'cancelled';
      } catch {
        // Cleanup status is returned as evidence; provider details stay redacted.
      }
      return {
        status: 'down',
        summary: 'Synthetic checkout did not reach hosted payment',
        error: 'payment_step_unavailable',
        payment: { reached: false },
        syntheticEntities: [
          {
            type: 'order',
            externalId: scenario.orderId,
            cleanupStatus,
          },
        ],
        steps: [{ key: 'reach_hosted_payment', status: 'failed' }],
        artifacts: null,
        metadata: null,
      };
    }
  }

  private paymentCheckoutConfigured(): boolean {
    return Boolean(
      this.config.get('ARC_SECRET_API_KEY', { infer: true }) &&
        this.config.get('WEB_APP_ORIGIN', { infer: true }),
    );
  }
}

function notConfiguredResult(
  reason: 'payment_provider_not_configured' | 'payable_product_not_configured',
): TurkiyeSyntheticScenarioResult {
  return {
    status: 'down',
    summary: 'Synthetic checkout is not configured',
    error: null,
    payment: { reached: false },
    syntheticEntities: [],
    steps: [{ key: 'configuration', status: 'not_configured', reason }],
    artifacts: null,
    metadata: { outcome: 'not_configured', reason },
  };
}
