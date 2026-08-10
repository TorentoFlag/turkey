type PricedProduct = {
  priceMinor: number | null;
  currency: string | null;
};

export function displayProductPrice(product: PricedProduct): string {
  if (product.priceMinor === null || product.currency === null) return "Цена уточняется";

  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: product.currency }).format(product.priceMinor / 100);
}
