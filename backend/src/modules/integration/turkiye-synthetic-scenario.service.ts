import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import type { AppEnv } from '../../config/env.js';
import { DatabaseService } from '../../database/database.service.js';
import {
  auditLog,
  syntheticScenarioRuns,
} from '../../database/schema/index.js';
import { OrdersService } from '../orders/orders.service.js';
import { PaymentsService } from '../payments/payments.service.js';

export type TurkiyeSyntheticScenarioInput = Readonly<{
  runId: string;
  siteId: string;
  scenarioKey: 'checkout_payment_reached';
  requestedAt: string;
}>;

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
    private readonly database: DatabaseService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  async runCheckoutPaymentReached(
    input: TurkiyeSyntheticScenarioInput,
  ): Promise<TurkiyeSyntheticScenarioResult> {
    if (!this.sandboxCheckoutConfigured()) {
      return notConfiguredResult('sandbox_payment_proof_not_configured');
    }

    const begin = await this.begin(input);
    if (!begin.owned) return begin.response;

    let scenario: Awaited<ReturnType<OrdersService['createScenarioOrder']>>;
    try {
      scenario = await this.orders.createScenarioOrder();
    } catch (error) {
      if (error instanceof BadRequestException) {
        return this.complete(
          input,
          notConfiguredResult('payable_product_not_configured'),
        );
      }
      throw error;
    }

    let checkoutUrl: URL;
    try {
      const checkout = await this.payments.createCheckout(
        scenario,
        scenario.orderId,
      );
      checkoutUrl = requireHttpsUrl(checkout.checkoutUrl);
    } catch {
      const cleanedUp = await this.tryCleanup(scenario.orderId);
      return this.complete(
        input,
        paymentUnavailableResult(
          scenario.orderId,
          cleanedUp ? 'cancelled' : 'failed',
        ),
        scenario.orderId,
      );
    }

    const cleanedUp = await this.tryCleanup(scenario.orderId);
    const result = cleanedUp
      ? healthyResult(scenario.orderId, checkoutUrl.host)
      : cleanupRequiredResult(scenario.orderId, checkoutUrl.host);
    return this.complete(input, result, scenario.orderId);
  }

  private async begin(
    input: TurkiyeSyntheticScenarioInput,
  ): Promise<
    | Readonly<{ owned: true }>
    | Readonly<{ owned: false; response: TurkiyeSyntheticScenarioResult }>
  > {
    const inserted = await this.database.db
      .insert(syntheticScenarioRuns)
      .values({
        id: input.runId,
        siteId: input.siteId,
        scenarioKey: input.scenarioKey,
        requestedAt: new Date(input.requestedAt),
        state: 'in_progress',
      })
      .onConflictDoNothing()
      .returning({ id: syntheticScenarioRuns.id });
    if (inserted[0]) return { owned: true };

    const existing = (
      await this.database.db
        .select()
        .from(syntheticScenarioRuns)
        .where(
          and(
            eq(syntheticScenarioRuns.id, input.runId),
            eq(syntheticScenarioRuns.siteId, input.siteId),
            eq(syntheticScenarioRuns.scenarioKey, input.scenarioKey),
          ),
        )
        .limit(1)
    )[0];
    if (!existing) throw new ConflictException('Scenario run ID conflicts.');
    if (existing.state === 'in_progress') {
      throw new ConflictException('Scenario run is already in progress.');
    }
    if (!existing.responseBody) {
      throw new Error('Completed scenario response is missing.');
    }
    return {
      owned: false,
      response: existing.responseBody as TurkiyeSyntheticScenarioResult,
    };
  }

  private async complete(
    input: TurkiyeSyntheticScenarioInput,
    result: TurkiyeSyntheticScenarioResult,
    orderId?: string,
  ): Promise<TurkiyeSyntheticScenarioResult> {
    await this.database.db.transaction(async (transaction) => {
      const updated = await transaction
        .update(syntheticScenarioRuns)
        .set({
          state: 'completed',
          orderId: orderId ?? null,
          responseBody: result,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(syntheticScenarioRuns.id, input.runId),
            eq(syntheticScenarioRuns.state, 'in_progress'),
          ),
        )
        .returning({ id: syntheticScenarioRuns.id });
      if (!updated[0]) throw new Error('Scenario run completion failed.');

      await transaction.insert(auditLog).values({
        actorId: 'vv-admin-scenario',
        action: 'synthetic_scenario.completed',
        entityType: 'synthetic_scenario_run',
        entityId: input.runId,
        payload: {
          runId: input.runId,
          siteId: input.siteId,
          scenarioKey: input.scenarioKey,
          ...(orderId ? { orderId } : {}),
          outcome: readOutcome(result),
        },
      });
    });
    return result;
  }

  private async tryCleanup(orderId: string): Promise<boolean> {
    try {
      await this.orders.cleanupScenarioOrder(orderId);
      return true;
    } catch {
      return false;
    }
  }

  private sandboxCheckoutConfigured(): boolean {
    const apiKey = this.config.get('ARC_SECRET_API_KEY', { infer: true });
    const apiBaseUrl = this.config.get('ARC_API_BASE_URL', { infer: true });
    const webAppOrigin = this.config.get('WEB_APP_ORIGIN', { infer: true });
    return Boolean(
      apiKey?.startsWith('sk_test_') &&
        isHttpsUrl(apiBaseUrl, true) &&
        webAppOrigin &&
        isHttpsUrl(webAppOrigin, false),
    );
  }
}

function healthyResult(
  orderId: string,
  checkoutUrlHost: string,
): TurkiyeSyntheticScenarioResult {
  return reachedResult({
    orderId,
    checkoutUrlHost,
    cleanupStatus: 'cancelled',
    summary: 'Synthetic checkout reached hosted payment',
    error: null,
    outcome: 'healthy',
  });
}

function cleanupRequiredResult(
  orderId: string,
  checkoutUrlHost: string,
): TurkiyeSyntheticScenarioResult {
  return reachedResult({
    orderId,
    checkoutUrlHost,
    cleanupStatus: 'failed',
    summary: 'Synthetic checkout reached payment but cleanup is required',
    error: 'cleanup_required',
    outcome: 'cleanup_required',
  });
}

function reachedResult(input: {
  orderId: string;
  checkoutUrlHost: string;
  cleanupStatus: 'cancelled' | 'failed';
  summary: string;
  error: string | null;
  outcome: 'healthy' | 'cleanup_required';
}): TurkiyeSyntheticScenarioResult {
  return {
    status: 'healthy',
    summary: input.summary,
    error: input.error,
    payment: { reached: true },
    syntheticEntities: [
      {
        type: 'order',
        externalId: input.orderId,
        cleanupStatus: input.cleanupStatus,
      },
    ],
    steps: [
      { key: 'create_synthetic_order', status: 'passed' },
      {
        key: 'reach_hosted_payment',
        status: 'passed',
        checkoutUrlHost: input.checkoutUrlHost,
      },
      {
        key: 'cleanup_synthetic_order',
        status: input.cleanupStatus === 'cancelled' ? 'passed' : 'failed',
      },
    ],
    artifacts: null,
    metadata: {
      outcome: input.outcome,
      checkoutUrlHost: input.checkoutUrlHost,
    },
  };
}

function paymentUnavailableResult(
  orderId: string,
  cleanupStatus: 'cancelled' | 'failed',
): TurkiyeSyntheticScenarioResult {
  return {
    status: 'down',
    summary: 'Synthetic checkout did not reach hosted payment',
    error: 'payment_step_unavailable',
    payment: { reached: false },
    syntheticEntities: [{ type: 'order', externalId: orderId, cleanupStatus }],
    steps: [
      { key: 'reach_hosted_payment', status: 'failed' },
      {
        key: 'cleanup_synthetic_order',
        status: cleanupStatus === 'cancelled' ? 'passed' : 'failed',
      },
    ],
    artifacts: null,
    metadata: { outcome: 'payment_step_unavailable' },
  };
}

function notConfiguredResult(
  reason:
    | 'sandbox_payment_proof_not_configured'
    | 'payable_product_not_configured',
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

function isHttpsUrl(value: string, allowPath: boolean): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (allowPath || url.pathname === '/')
    );
  } catch {
    return false;
  }
}

function requireHttpsUrl(value: string): URL {
  if (!isHttpsUrl(value, true)) throw new Error('Unsafe checkout URL.');
  return new URL(value);
}

function readOutcome(result: TurkiyeSyntheticScenarioResult): string {
  const outcome = result.metadata?.outcome;
  return typeof outcome === 'string' ? outcome : result.status;
}
