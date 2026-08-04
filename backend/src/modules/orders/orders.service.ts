import { BadRequestException, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service.js';
import {
  orders,
  type Order,
  type Product,
} from '../../database/schema/index.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { CatalogService } from '../catalog/catalog.service.js';

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
  isProcessed: boolean;
  createdAt: Date;
}>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly catalog: CatalogService,
  ) {}

  async create(
    user: AuthenticatedUser,
    input: unknown,
  ): Promise<OrderResponse> {
    const parsed = createOrderSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid order payload.');
    }

    const command = parsed.data;
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

    const inserted = await this.database.db
      .insert(orders)
      .values({
        userId: user.id,
        productId: product.id,
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
      .returning();
    const order = inserted[0];

    if (!order) {
      throw new Error('Order insertion failed.');
    }

    return toOrderResponse(order);
  }

  async listForUser(user: AuthenticatedUser): Promise<OrderResponse[]> {
    const records = await this.database.db
      .select()
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt), desc(orders.id));

    return records.map(toOrderResponse);
  }
}

function toOrderResponse(order: Order): OrderResponse {
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
    isProcessed: order.isProcessed,
    createdAt: order.createdAt,
  };
}
