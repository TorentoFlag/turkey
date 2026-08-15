import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service.js';
import {
  orders,
  users,
  auditLog,
  outboxEvents,
  payments,
  products,
  refunds,
  type Order,
  type Payment,
  type Product,
} from '../../database/schema/index.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import {
  CatalogRevisionConflictError,
  CatalogService,
  type CatalogExecutor,
} from '../catalog/catalog.service.js';
import { PaymentsService } from '../payments/payments.service.js';

const createOrderSchema = z
  .object({
    productId: z.uuid(),
    email: z.string().trim().toLowerCase().email().max(320),
    phone: z.string().trim().min(5).max(50),
    deliveryAddress: z.string().trim().min(1).max(2_000).optional(),
    bookingStartDate: z.iso.date().optional(),
    bookingEndDate: z.iso.date().optional(),
  })
  .strict();

const updateOrderProcessingSchema = z
  .object({ isProcessed: z.boolean() })
  .strict();

export type OrderResponse = Readonly<{
  id: string;
  product: Readonly<{
    id: string;
    title: string;
    type: Product['type'];
    priceMinor: number | null;
    currency: string | null;
  }>;
  email: string;
  phone: string;
  deliveryAddress: string | null;
  bookingStartDate: string | null;
  bookingEndDate: string | null;
  payment: Readonly<{
    state: Payment['state'];
  }> | null;
  refund: Readonly<{
    state: 'processing' | 'succeeded' | 'failed';
  }> | null;
  createdAt: Date;
}>;

export type ProductOrderDeletionInspection = Readonly<{
  deletedOrderIds: readonly string[];
  protectedOrders: number;
}>;

type OrderCommandOptions = Readonly<{
  executor?: CatalogExecutor;
  expectedRevision?: number;
}>;

export class OrderHistoryProtectedError extends Error {
  readonly status = 409;
  readonly type = 'catalog/order-history-protected';

  constructor() {
    super('Customer or financial order history prevents product deletion.');
  }
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly catalog: CatalogService,
    private readonly paymentRecords: PaymentsService,
  ) {}

  async create(
    user: AuthenticatedUser,
    input: unknown,
    idempotencyKey?: string,
  ): Promise<OrderResponse> {
    const parsed = createOrderSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid order payload.');
    }

    const command = parsed.data;
    const key = parseIdempotencyKey(idempotencyKey);
    const existing = await this.findOrderByIdempotencyKey(user.id, key);

    if (existing) {
      return toOrderResponse(existing);
    }
    const product = await this.catalog.getActiveProductForOrder(
      command.productId,
    );

    const booking = product.type === 'booking';

    if (booking && (!command.bookingStartDate || !command.bookingEndDate)) {
      throw new BadRequestException(
        'Booking requests require start and end dates.',
      );
    }

    if (
      booking &&
      command.bookingStartDate &&
      command.bookingEndDate &&
      command.bookingStartDate > command.bookingEndDate
    ) {
      throw new BadRequestException(
        'Booking end date must not be before start.',
      );
    }

    if (product.type === 'physical' && !command.deliveryAddress) {
      throw new BadRequestException(
        'Physical product orders require a delivery address.',
      );
    }

    const order = await this.database.db.transaction(async (transaction) => {
      await lockProductOrders(transaction, product.id);
      const inserted = await transaction
        .insert(orders)
        .values({
          userId: user.id,
          productId: product.id,
          idempotencyKey: key,
          productTitle: product.title,
          productType: product.type,
          priceMinor: product.priceMinor,
          currency: product.currency,
          email: command.email,
          phone: command.phone,
          deliveryAddress:
            product.type === 'physical' ? command.deliveryAddress : null,
          bookingStartDate: booking ? command.bookingStartDate : null,
          bookingEndDate: booking ? command.bookingEndDate : null,
        })
        .onConflictDoNothing({ target: orders.idempotencyKey })
        .returning();
      const created = inserted[0];

      if (!created) {
        const repeated = await transaction
          .select()
          .from(orders)
          .where(
            and(eq(orders.userId, user.id), eq(orders.idempotencyKey, key)),
          )
          .limit(1);
        const existingOrder = repeated[0];
        if (!existingOrder) {
          throw new Error('Order idempotency key collision.');
        }
        return existingOrder;
      }

      if (booking) {
        await transaction.insert(outboxEvents).values({
          type: 'order.accepted',
          aggregateId: created.id,
          idempotencyKey: `order.accepted:${created.id}`,
          payload: { orderId: created.id },
        });
      }

      return created;
    });

    return toOrderResponse(order);
  }

  async createScenarioOrder(): Promise<
    AuthenticatedUser & { readonly orderId: string }
  > {
    const scenarioEmail = 'scenario@vv-admin.invalid';
    const createdUser = await this.database.db
      .insert(users)
      .values({
        email: scenarioEmail,
        passwordHash: await argon2.hash(randomUUID()),
      })
      .onConflictDoNothing()
      .returning();
    const user =
      createdUser[0] ??
      (
        await this.database.db
          .select()
          .from(users)
          .where(eq(users.email, scenarioEmail))
          .limit(1)
      )[0];
    if (!user) throw new Error('Scenario user initialization failed.');
    const product = (
      await this.database.db
        .select()
        .from(products)
        .where(
          and(
            eq(products.isActive, true),
            ne(products.type, 'booking'),
            isNotNull(products.priceMinor),
            isNotNull(products.currency),
            inArray(products.currency, ['RUB', 'KZT', 'UZS']),
          ),
        )
        .limit(1)
    )[0];
    if (!product || product.priceMinor === null || product.currency === null) {
      throw new BadRequestException('No payable active product for scenario.');
    }
    const inserted = await this.database.db.transaction(async (transaction) => {
      await lockProductOrders(transaction, product.id);
      return transaction
        .insert(orders)
        .values({
          userId: user.id,
          productId: product.id,
          idempotencyKey: randomUUID(),
          productTitle: product.title,
          productType: product.type,
          priceMinor: product.priceMinor,
          currency: product.currency,
          email: scenarioEmail,
          phone: '+70000000000',
          deliveryAddress:
            product.type === 'physical' ? 'Scenario address' : null,
          isScenario: true,
          isPurgeable: false,
        })
        .returning({ id: orders.id });
    });
    return { id: user.id, email: user.email, orderId: inserted[0]!.id };
  }

  async cleanupScenarioOrder(orderId: string): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
      const updated = await transaction
        .update(orders)
        .set({ isProcessed: true })
        .where(and(eq(orders.id, orderId), eq(orders.isScenario, true)))
        .returning({ id: orders.id });

      if (!updated[0]) {
        throw new NotFoundException('Scenario order was not found.');
      }

      await transaction
        .update(payments)
        .set({ state: 'failed', updatedAt: new Date() })
        .where(
          and(eq(payments.orderId, orderId), eq(payments.state, 'pending')),
        );
    });
  }

  async listForUser(user: AuthenticatedUser): Promise<OrderResponse[]> {
    const records = await this.database.db
      .select({
        order: orders,
        payment: { state: payments.state },
        refund: { state: refunds.state },
      })
      .from(orders)
      .leftJoin(payments, eq(payments.orderId, orders.id))
      .leftJoin(refunds, eq(refunds.paymentId, payments.id))
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt), desc(orders.id));

    return records.map(({ order, payment, refund }) =>
      toOrderResponse(order, payment?.state, refund?.state),
    );
  }

  async getForUser(
    user: AuthenticatedUser,
    id: string,
  ): Promise<OrderResponse> {
    const records = await this.database.db
      .select({
        order: orders,
        payment: { state: payments.state },
        refund: { state: refunds.state },
      })
      .from(orders)
      .leftJoin(payments, eq(payments.orderId, orders.id))
      .leftJoin(refunds, eq(refunds.paymentId, payments.id))
      .where(and(eq(orders.id, id), eq(orders.userId, user.id)))
      .limit(1);
    const record = records[0];

    if (!record) {
      throw new NotFoundException('Order was not found.');
    }

    return toOrderResponse(
      record.order,
      record.payment?.state,
      record.refund?.state,
    );
  }

  private async findOrderByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<Order | undefined> {
    const records = await this.database.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);

    return records[0];
  }

  async listForAdmin(executor: CatalogExecutor = this.database.db) {
    const records = await executor
      .select({
        order: orders,
        payment: {
          state: payments.state,
          providerPaymentId: payments.providerPaymentId,
        },
        refund: {
          state: refunds.state,
          providerRefundId: refunds.providerRefundId,
          requestedAt: refunds.requestedAt,
          confirmedAt: refunds.confirmedAt,
          errorMessage: refunds.errorMessage,
        },
      })
      .from(orders)
      .leftJoin(payments, eq(payments.orderId, orders.id))
      .leftJoin(refunds, eq(refunds.paymentId, payments.id))
      .orderBy(desc(orders.createdAt), desc(orders.id));

    return records.map(({ order, payment, refund }) => ({
      ...order,
      payment,
      refund,
    }));
  }

  async getForAdmin(id: string, executor: CatalogExecutor = this.database.db) {
    const records = await executor
      .select({
        order: orders,
        payment: {
          state: payments.state,
          providerPaymentId: payments.providerPaymentId,
        },
        refund: {
          state: refunds.state,
          providerRefundId: refunds.providerRefundId,
          requestedAt: refunds.requestedAt,
          confirmedAt: refunds.confirmedAt,
          errorMessage: refunds.errorMessage,
        },
      })
      .from(orders)
      .leftJoin(payments, eq(payments.orderId, orders.id))
      .leftJoin(refunds, eq(refunds.paymentId, payments.id))
      .where(eq(orders.id, id))
      .limit(1);
    const record = records[0];
    if (!record) throw new NotFoundException('Order was not found.');
    return { ...record.order, payment: record.payment, refund: record.refund };
  }

  async updateProcessing(
    id: string,
    actor: AuthenticatedAdmin,
    input: unknown,
    options: OrderCommandOptions = {},
  ): Promise<Order> {
    const parsed = updateOrderProcessingSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid order payload.');
    }

    return this.executeWrite(options.executor, async (transaction) => {
      const records = await transaction
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1);
      const current = records[0];

      if (!current) {
        throw new NotFoundException('Order was not found.');
      }

      if (
        options.expectedRevision !== undefined &&
        current.revision !== options.expectedRevision
      ) {
        throw new CatalogRevisionConflictError();
      }

      if (current.isProcessed === parsed.data.isProcessed) {
        return current;
      }

      const updated = await transaction
        .update(orders)
        .set({
          isProcessed: parsed.data.isProcessed,
          revision: sql`${orders.revision} + 1`,
        })
        .where(
          options.expectedRevision === undefined
            ? eq(orders.id, id)
            : and(
                eq(orders.id, id),
                eq(orders.revision, options.expectedRevision),
              ),
        )
        .returning();
      const order = updated[0];

      if (!order) {
        if (options.expectedRevision !== undefined) {
          throw new CatalogRevisionConflictError();
        }
        throw new NotFoundException('Order was not found.');
      }

      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'order.processed',
        entityType: 'order',
        entityId: order.id,
        payload: {
          isProcessed: { from: current.isProcessed, to: order.isProcessed },
        },
      });

      return order;
    });
  }

  async inspectProductOrderDeletion(
    productId: string,
    executor: CatalogExecutor = this.database.db,
  ): Promise<ProductOrderDeletionInspection> {
    await lockProductOrders(executor, productId);
    const linkedOrders = await executor
      .select({
        id: orders.id,
        isProcessed: orders.isProcessed,
        isPurgeable: orders.isPurgeable,
        isScenario: orders.isScenario,
      })
      .from(orders)
      .where(eq(orders.productId, productId))
      .for('update');
    const financialOrderIds = await this.paymentRecords.listFinancialOrderIds(
      linkedOrders.map((order) => order.id),
      executor,
    );
    const deletedOrderIds = linkedOrders
      .filter(
        (order) =>
          order.isScenario &&
          order.isPurgeable &&
          !order.isProcessed &&
          !financialOrderIds.has(order.id),
      )
      .map((order) => order.id)
      .sort();
    return {
      deletedOrderIds,
      protectedOrders: linkedOrders.length - deletedOrderIds.length,
    };
  }

  async deleteProductWithTechnicalCascade(
    productId: string,
    actor: AuthenticatedAdmin,
    expectedRevision: number,
    executor: CatalogExecutor,
  ): Promise<ProductOrderDeletionInspection> {
    const inspection = await this.inspectProductOrderDeletion(
      productId,
      executor,
    );
    if (inspection.protectedOrders > 0) {
      throw new OrderHistoryProtectedError();
    }
    if (inspection.deletedOrderIds.length > 0) {
      const deleted = await executor
        .delete(orders)
        .where(
          and(
            eq(orders.productId, productId),
            eq(orders.isScenario, true),
            eq(orders.isPurgeable, true),
            eq(orders.isProcessed, false),
            inArray(orders.id, [...inspection.deletedOrderIds]),
          ),
        )
        .returning({ id: orders.id });
      const deletedIds = deleted.map((order) => order.id).sort();
      if (
        deletedIds.length !== inspection.deletedOrderIds.length ||
        deletedIds.some(
          (orderId, index) => orderId !== inspection.deletedOrderIds[index],
        )
      ) {
        throw new OrderHistoryProtectedError();
      }
    }
    await this.catalog.deleteProduct(productId, actor, {
      audit: false,
      executor,
      expectedRevision,
    });
    await executor.insert(auditLog).values({
      actorId: actor.actorId,
      action: 'product.deleted',
      entityType: 'product',
      entityId: productId,
      payload: {
        productId,
        deletedOrderIds: inspection.deletedOrderIds,
        deletedOrderCount: inspection.deletedOrderIds.length,
      },
    });
    return inspection;
  }

  private executeWrite<T>(
    executor: CatalogExecutor | undefined,
    command: (executor: CatalogExecutor) => Promise<T>,
  ): Promise<T> {
    return executor
      ? command(executor)
      : this.database.db.transaction((transaction) => command(transaction));
  }
}

function lockProductOrders(
  executor: Pick<CatalogExecutor, 'execute'>,
  productId: string,
) {
  return executor.execute(
    sql`select pg_advisory_xact_lock(22094, hashtext(${productId}))`,
  );
}

function toOrderResponse(
  order: Order,
  paymentState: Payment['state'] | null | undefined = null,
  refundState: 'processing' | 'succeeded' | 'failed' | null | undefined = null,
): OrderResponse {
  return {
    id: order.id,
    product: {
      id: order.productId,
      title: order.productTitle,
      type: order.productType,
      priceMinor: order.priceMinor,
      currency: order.currency,
    },
    email: order.email,
    phone: order.phone,
    deliveryAddress: order.deliveryAddress,
    bookingStartDate: order.bookingStartDate,
    bookingEndDate: order.bookingEndDate,
    payment: paymentState ? { state: paymentState } : null,
    refund: refundState ? { state: refundState } : null,
    createdAt: order.createdAt,
  };
}

function parseIdempotencyKey(value: string | undefined): string {
  if (value === undefined) return randomUUID();
  const parsed = z.uuid().safeParse(value.trim());
  if (!parsed.success) {
    throw new BadRequestException('Invalid idempotency key.');
  }
  return parsed.data;
}
