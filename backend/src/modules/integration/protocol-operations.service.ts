import { Injectable } from '@nestjs/common';
import { and, eq, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import {
  catalogProtocolOperations,
  type CatalogProtocolOperation,
} from '../../database/schema/integration-protocol.js';

export type ProtocolOperationInput = Readonly<{
  actorId: string;
  idempotencyKey: string;
  method: string;
  path: string;
  requestFingerprint: string;
  requestId: string;
  siteKey: string;
}>;

export type ProtocolOperationResponse = Readonly<{
  body: unknown;
  status: number;
}>;

export type ProtocolOperationCapability = 'catalog' | 'store-orders';

export type ProtocolOperationRecovery =
  | Readonly<{
      requestId: string;
      status: 'in_progress';
    }>
  | Readonly<{
      requestId: string;
      response: ProtocolOperationResponse;
      status: 'completed' | 'failed';
    }>;

export type ProtocolOperationBeginResult =
  | Readonly<{
      owned: boolean;
      operation: CatalogProtocolOperation;
      state: 'in_progress';
    }>
  | Readonly<{
      operation: CatalogProtocolOperation;
      response: ProtocolOperationResponse;
      state: 'completed' | 'failed';
    }>;

type ProtocolOperationExecutor = Pick<
  DatabaseService['db'],
  'insert' | 'select' | 'update'
>;

export class ProtocolIdempotencyConflictError extends Error {
  readonly status = 409;
  readonly type = 'catalog/idempotency-conflict';

  constructor() {
    super('Protocol idempotency key conflicts with a different request.');
  }
}

export class ProtocolRequestIdConflictError extends Error {
  readonly status = 409;
  readonly type = 'catalog/request-id-conflict';

  constructor() {
    super('Protocol request ID is already associated with another request.');
  }
}

@Injectable()
export class ProtocolOperationsService {
  constructor(private readonly database: DatabaseService) {}

  async begin(
    input: ProtocolOperationInput,
    executor: ProtocolOperationExecutor = this.database.db,
  ): Promise<ProtocolOperationBeginResult> {
    const inserted = await executor
      .insert(catalogProtocolOperations)
      .values({
        actorId: input.actorId,
        id: randomUUID(),
        idempotencyKey: input.idempotencyKey,
        method: input.method.toUpperCase(),
        path: input.path,
        requestFingerprint: input.requestFingerprint,
        requestId: input.requestId,
        siteKey: input.siteKey,
        state: 'in_progress',
      })
      .onConflictDoNothing()
      .returning();

    const owned = inserted[0] !== undefined;
    const operation =
      inserted[0] ?? (await this.findByIdempotencyKey(input, executor));

    if (operation) {
      if (operation.requestFingerprint !== input.requestFingerprint) {
        throw new ProtocolIdempotencyConflictError();
      }

      if (operation.state === 'in_progress') {
        return { operation, owned, state: 'in_progress' };
      }

      if (
        operation.responseStatus === null ||
        operation.responseBody === null
      ) {
        throw new Error('Terminal protocol operation response is missing.');
      }

      return {
        operation,
        response: {
          body: operation.responseBody,
          status: operation.responseStatus,
        },
        state: operation.state,
      };
    }

    const existingRequestId = await this.findByRequestId(input, executor);

    if (existingRequestId) {
      throw new ProtocolRequestIdConflictError();
    }

    throw new Error('Protocol operation initialization failed.');
  }

  private async findByIdempotencyKey(
    input: ProtocolOperationInput,
    executor: ProtocolOperationExecutor,
  ): Promise<CatalogProtocolOperation | undefined> {
    return (
      await executor
        .select()
        .from(catalogProtocolOperations)
        .where(
          and(
            eq(catalogProtocolOperations.siteKey, input.siteKey),
            eq(catalogProtocolOperations.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1)
    )[0];
  }

  private async findByRequestId(
    input: ProtocolOperationInput,
    executor: ProtocolOperationExecutor,
  ): Promise<CatalogProtocolOperation | undefined> {
    return (
      await executor
        .select()
        .from(catalogProtocolOperations)
        .where(
          and(
            eq(catalogProtocolOperations.siteKey, input.siteKey),
            eq(catalogProtocolOperations.requestId, input.requestId),
          ),
        )
        .limit(1)
    )[0];
  }

  async complete(
    operation: CatalogProtocolOperation,
    response: ProtocolOperationResponse,
    executor: ProtocolOperationExecutor = this.database.db,
  ): Promise<CatalogProtocolOperation> {
    return this.setTerminalResponse(operation, 'completed', response, executor);
  }

  async fail(
    operation: CatalogProtocolOperation,
    response: ProtocolOperationResponse,
    executor: ProtocolOperationExecutor = this.database.db,
  ): Promise<CatalogProtocolOperation> {
    return this.setTerminalResponse(operation, 'failed', response, executor);
  }

  async getCompleted(
    siteKey: string,
    operationId: string,
  ): Promise<ProtocolOperationResponse | null> {
    const operation = (
      await this.database.db
        .select()
        .from(catalogProtocolOperations)
        .where(
          and(
            eq(catalogProtocolOperations.id, operationId),
            eq(catalogProtocolOperations.siteKey, siteKey),
          ),
        )
        .limit(1)
    )[0];

    if (
      !operation ||
      operation.state === 'in_progress' ||
      operation.responseStatus === null ||
      operation.responseBody === null
    ) {
      return null;
    }

    return { body: operation.responseBody, status: operation.responseStatus };
  }

  async getByRequestId(
    siteKey: string,
    requestId: string,
    capability: ProtocolOperationCapability,
  ): Promise<ProtocolOperationRecovery | null> {
    const pathPrefix = `/admin/integration/${capability}/v1/`;
    const operation = (
      await this.database.db
        .select()
        .from(catalogProtocolOperations)
        .where(
          and(
            eq(catalogProtocolOperations.siteKey, siteKey),
            eq(catalogProtocolOperations.requestId, requestId),
            like(catalogProtocolOperations.path, `${pathPrefix}%`),
          ),
        )
        .limit(1)
    )[0];

    if (!operation) return null;

    if (operation.state === 'in_progress') {
      return { requestId: operation.requestId, status: operation.state };
    }

    if (operation.responseStatus === null || operation.responseBody === null) {
      throw new Error('Terminal protocol operation response is missing.');
    }

    return {
      requestId: operation.requestId,
      response: {
        body: toSafeRecoveryBody(operation.responseBody),
        status: operation.responseStatus,
      },
      status: operation.state,
    };
  }

  private async setTerminalResponse(
    operation: CatalogProtocolOperation,
    state: 'completed' | 'failed',
    response: ProtocolOperationResponse,
    executor: ProtocolOperationExecutor,
  ): Promise<CatalogProtocolOperation> {
    const updated = await executor
      .update(catalogProtocolOperations)
      .set({
        completedAt: new Date(),
        responseBody: response.body,
        responseStatus: response.status,
        state,
      })
      .where(
        and(
          eq(catalogProtocolOperations.id, operation.id),
          eq(catalogProtocolOperations.siteKey, operation.siteKey),
          eq(catalogProtocolOperations.state, 'in_progress'),
        ),
      )
      .returning();
    const persisted = updated[0];

    if (!persisted) {
      throw new Error('Protocol operation is not in progress.');
    }

    return persisted;
  }
}

function toSafeRecoveryBody(body: unknown): unknown {
  if (!isRecord(body)) {
    throw new Error('Unsupported terminal protocol operation response.');
  }

  if ('resource' in body) {
    return { resource: body.resource };
  }

  if (
    typeof body.type === 'string' &&
    typeof body.title === 'string' &&
    typeof body.status === 'number'
  ) {
    return {
      type: body.type,
      title: body.title,
      status: body.status,
    };
  }

  throw new Error('Unsupported terminal protocol operation response.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
