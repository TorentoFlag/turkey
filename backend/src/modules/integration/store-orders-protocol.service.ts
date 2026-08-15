import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import type { CatalogExecutor } from '../catalog/catalog.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { RefundsService } from '../payments/refunds.service.js';
import {
  CatalogProtocolError,
  toCatalogProblem,
} from './catalog-protocol.schemas.js';
import type { ProtocolResponse } from './catalog-protocol.service.js';
import type { AuthenticatedProtocolActor } from './protocol-auth.js';
import { ProtocolOperationsService } from './protocol-operations.service.js';

const emptyRefundCommandSchema = z.union([
  z.undefined(),
  z.object({}).strict(),
]);

type MutationContext = Readonly<{
  actor: AuthenticatedProtocolActor;
  request: FastifyRequest;
}>;

@Injectable()
export class StoreOrdersProtocolService {
  constructor(
    private readonly database: DatabaseService,
    private readonly operations: ProtocolOperationsService,
    private readonly orders: OrdersService,
    private readonly refunds: RefundsService,
  ) {}

  async listOrders() {
    return {
      items: (await this.orders.listForAdmin()).map(toStoreOrder),
      nextCursor: null,
    };
  }

  async updateProcessing(
    context: MutationContext,
    orderId: string,
    expectedRevision: number,
    input: unknown,
  ): Promise<ProtocolResponse> {
    return this.mutateInTransaction(context, 200, async (actor, executor) => {
      await this.orders.updateProcessing(orderId, actor, input, {
        executor,
        expectedRevision,
      });
      return toStoreOrder(await this.orders.getForAdmin(orderId, executor));
    });
  }

  async requestFullRefund(
    context: MutationContext,
    orderId: string,
    expectedRevision: number,
    input: unknown,
  ): Promise<ProtocolResponse> {
    if (!emptyRefundCommandSchema.safeParse(input).success) {
      throw new CatalogProtocolError(
        400,
        'catalog/invalid-request',
        'Refund request is invalid.',
      );
    }
    return this.mutateExternal(context, 201, async (actor) => {
      const result = await this.refunds.requestFullRefundForProtocol(
        orderId,
        actor,
        expectedRevision,
      );
      return {
        orderId,
        revision: String(result.orderRevision),
        refund: toRefund(result.refund),
      };
    });
  }

  async getOperation(
    siteKey: string,
    operationId: string,
  ): Promise<ProtocolResponse> {
    const response = await this.operations.getCompleted(siteKey, operationId);
    if (!response) {
      throw new NotFoundException('Protocol operation was not found.');
    }
    return {
      body: response.body,
      status: response.status,
      etag: responseEtag(response.body),
      problem: isProblemBody(response.body),
    };
  }

  private async mutateInTransaction<T>(
    context: MutationContext,
    successStatus: number,
    command: (
      actor: AuthenticatedAdmin,
      executor: CatalogExecutor,
    ) => Promise<T>,
  ): Promise<ProtocolResponse> {
    const operationInput = protocolOperationInput(context);
    return this.database.db.transaction(async (transaction) => {
      const begin = await this.operations.begin(operationInput, transaction);
      const replay = replayResponse(begin);
      if (replay) return replay;
      try {
        const resource = await transaction.transaction((savepoint) =>
          command({ actorId: context.actor.actorId }, savepoint),
        );
        const body = { operationId: begin.operation.id, resource };
        await this.operations.complete(
          begin.operation,
          { body, status: successStatus },
          transaction,
        );
        return {
          body,
          status: successStatus,
          etag: responseEtag(body),
        };
      } catch (error) {
        const problem = toCatalogProblem(error, begin.operation.id);
        await this.operations.fail(
          begin.operation,
          { body: problem.body, status: problem.status },
          transaction,
        );
        return { body: problem.body, status: problem.status, problem: true };
      }
    });
  }

  private async mutateExternal<T>(
    context: MutationContext,
    successStatus: number,
    command: (actor: AuthenticatedAdmin) => Promise<T>,
  ): Promise<ProtocolResponse> {
    const begin = await this.operations.begin(protocolOperationInput(context));
    const replay = replayResponse(begin);
    if (replay) return replay;
    try {
      const resource = await command({ actorId: context.actor.actorId });
      const body = { operationId: begin.operation.id, resource };
      await this.operations.complete(begin.operation, {
        body,
        status: successStatus,
      });
      return { body, status: successStatus, etag: responseEtag(body) };
    } catch (error) {
      const problem = toCatalogProblem(error, begin.operation.id);
      await this.operations.fail(begin.operation, {
        body: problem.body,
        status: problem.status,
      });
      return { body: problem.body, status: problem.status, problem: true };
    }
  }
}

function protocolOperationInput(context: MutationContext) {
  if (!context.actor.idempotencyKey) {
    throw new CatalogProtocolError(
      400,
      'catalog/invalid-request',
      'Idempotency key is required.',
    );
  }
  const rawBody = context.request.rawBody ?? Buffer.alloc(0);
  const ifMatch = context.request.headers['if-match'];
  const ifMatchFingerprint =
    ifMatch === undefined
      ? '\0'
      : Array.isArray(ifMatch)
        ? `\x01${ifMatch.join(',')}`
        : `\x01${ifMatch}`;
  const requestFingerprint = createHash('sha256')
    .update(context.request.method.toUpperCase())
    .update('\0')
    .update(context.request.url)
    .update('\0')
    .update(ifMatchFingerprint)
    .update('\0')
    .update(rawBody)
    .digest('hex');
  return {
    actorId: context.actor.actorId,
    idempotencyKey: context.actor.idempotencyKey,
    method: context.request.method,
    path: context.request.url,
    requestFingerprint,
    requestId: context.actor.requestId,
    siteKey: context.actor.siteKey,
  };
}

function replayResponse(
  begin: Awaited<ReturnType<ProtocolOperationsService['begin']>>,
): ProtocolResponse | null {
  if (begin.state !== 'in_progress') {
    return {
      body: begin.response.body,
      status: begin.response.status,
      etag: responseEtag(begin.response.body),
      problem: begin.state === 'failed',
    };
  }
  if (begin.owned) return null;
  const problem = toCatalogProblem(
    new CatalogProtocolError(
      409,
      'catalog/operation-in-progress',
      'Protocol operation is already in progress.',
    ),
    begin.operation.id,
  );
  return { body: problem.body, status: problem.status, problem: true };
}

function toStoreOrder(
  order: Awaited<ReturnType<OrdersService['getForAdmin']>>,
) {
  return {
    id: order.id,
    revision: String(order.revision),
    productTitle: order.productTitle,
    productType: order.productType,
    priceMinor: order.priceMinor,
    currency: order.currency,
    email: order.email,
    phone: order.phone,
    deliveryAddress: order.deliveryAddress,
    bookingStartDate: order.bookingStartDate,
    bookingEndDate: order.bookingEndDate,
    isProcessed: order.isProcessed,
    payment: order.payment,
    refund: order.refund
      ? {
          ...order.refund,
          requestedAt: order.refund.requestedAt?.toISOString() ?? null,
          confirmedAt: order.refund.confirmedAt?.toISOString() ?? null,
        }
      : null,
    createdAt: order.createdAt.toISOString(),
  };
}

function toRefund(refund: {
  amountMinor: number;
  currency: string;
  providerRefundId: string | null;
  state: 'processing' | 'succeeded' | 'failed';
}) {
  return {
    state: refund.state,
    providerRefundId: refund.providerRefundId,
    amountMinor: refund.amountMinor,
    currency: refund.currency,
  };
}

function responseEtag(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('resource' in body)) {
    return undefined;
  }
  const resource = body.resource;
  if (!resource || typeof resource !== 'object' || !('revision' in resource)) {
    return undefined;
  }
  return typeof resource.revision === 'string'
    ? `"${resource.revision}"`
    : undefined;
}

function isProblemBody(body: unknown): boolean {
  return Boolean(
    body && typeof body === 'object' && 'type' in body && 'status' in body,
  );
}
