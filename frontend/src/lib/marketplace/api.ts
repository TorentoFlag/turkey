export type ProductType = "auto_delivery" | "physical" | "booking";

export type ApiCategory = Readonly<{
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  children: ApiCategory[];
}>;

export type ApiProduct = Readonly<{
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  type: ProductType;
  priceMinor: number | null;
  currency: string | null;
}>;

export type ApiOrder = Readonly<{
  id: string;
  product: Readonly<{
    id: string;
    title: string;
    type: ProductType;
    priceMinor: number | null;
    currency: string | null;
  }>;
  email: string;
  phone: string;
  deliveryAddress: string | null;
  bookingStartDate: string | null;
  bookingEndDate: string | null;
  isProcessed: boolean;
  payment: Readonly<{
    state: "pending" | "succeeded" | "failed";
  }> | null;
  refund: Readonly<{
    state: "processing" | "succeeded" | "failed";
  }> | null;
  createdAt: string;
}>;

export class MarketplaceApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "MarketplaceApiError";
  }
}

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new MarketplaceApiError(
      0,
      "Не удалось связаться с сервисом. Попробуйте ещё раз.",
    );
  }

  if (!response.ok) {
    throw new MarketplaceApiError(
      response.status,
      errorMessage(response.status),
    );
  }

  return response.json() as Promise<T>;
}

function errorMessage(status: number): string {
  if (status === 401) return "Войдите в аккаунт, чтобы продолжить.";
  if (status === 404) return "Данные больше недоступны.";
  if (status === 409) return "Это действие уже было выполнено.";
  if (status === 400 || status === 422) return "Проверьте заполненные поля.";
  return "Сервис временно недоступен. Попробуйте ещё раз.";
}

export const marketplaceApi = {
  register(input: { email: string; password: string }) {
    return request<{ email: string }>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  login(input: { email: string; password: string }) {
    return request<{ email: string }>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  logout() {
    return request<Record<string, never>>("/v1/auth/logout", {
      method: "POST",
    });
  },
  me() {
    return request<{ email: string }>("/v1/me");
  },
  categories() {
    return request<ApiCategory[]>("/v1/public/categories");
  },
  products(categorySlug?: string) {
    const query = categorySlug
      ? `?categorySlug=${encodeURIComponent(categorySlug)}`
      : "";
    return request<ApiProduct[]>(`/v1/public/products${query}`);
  },
  product(slug: string) {
    return request<ApiProduct>(
      `/v1/public/products/${encodeURIComponent(slug)}`,
    );
  },
  orders() {
    return request<ApiOrder[]>("/v1/me/orders");
  },
  order(id: string) {
    return request<ApiOrder>(`/v1/me/orders/${encodeURIComponent(id)}`);
  },
  createOrder(input: {
    productId: string;
    email: string;
    phone: string;
    deliveryAddress?: string;
    bookingStartDate?: string;
    bookingEndDate?: string;
    idempotencyKey: string;
  }) {
    const { idempotencyKey, ...body } = input;
    return request<ApiOrder>("/v1/orders", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify(body),
    });
  },
  checkout(orderId: string) {
    return request<{ checkoutUrl: string }>(
      `/v1/orders/${encodeURIComponent(orderId)}/checkout`,
      {
        method: "POST",
      },
    );
  },
};
