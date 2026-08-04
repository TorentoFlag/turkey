import type { MarketplaceCartItem, MarketplaceOrder } from "@/types/marketplace";

export const CART_STORAGE_KEY = "faro-cart";
export const ORDERS_STORAGE_KEY = "faro-orders";
export const CART_UPDATED_EVENT = "faro-cart-updated";
export const ORDERS_UPDATED_EVENT = "faro-orders-updated";

function parse<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

export function readCart(): MarketplaceCartItem[] {
  const raw = parse<unknown[]>(CART_STORAGE_KEY, []);
  if (!Array.isArray(raw)) return [];
  const normalized = raw.flatMap((entry) => {
    if (typeof entry === "string" && entry) return [{ serviceId: entry, quantity: 1 }];
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<MarketplaceCartItem>;
    if (typeof item.serviceId !== "string" || !item.serviceId) return [];
    return [{ serviceId: item.serviceId, quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)) }];
  });
  return normalized.reduce<MarketplaceCartItem[]>((items, item) => {
    const existing = items.find(({ serviceId }) => serviceId === item.serviceId);
    if (existing) existing.quantity += item.quantity;
    else items.push(item);
    return items;
  }, []);
}

export function writeCart(cart: MarketplaceCartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart.filter(({ quantity }) => quantity > 0)));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function readOrders(): MarketplaceOrder[] {
  const orders = parse<MarketplaceOrder[]>(ORDERS_STORAGE_KEY, []);
  return Array.isArray(orders) ? orders : [];
}

export function writeOrders(orders: MarketplaceOrder[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders));
  window.dispatchEvent(new Event(ORDERS_UPDATED_EVENT));
}

export function createOrderId() {
  return `FARO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
