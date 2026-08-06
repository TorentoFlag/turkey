import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const required = [
  ["src/lib/marketplace/api.ts", 'credentials: "include"'],
  [
    "src/components/marketplace/CatalogBrowser.tsx",
    "marketplaceApi.categories",
  ],
  ["src/components/marketplace/CatalogBrowser.tsx", "marketplaceApi.products"],
  ["src/components/marketplace/AccountGate.tsx", "marketplaceApi.register"],
  ["src/components/marketplace/AccountOrders.tsx", ".orders()"],
  ["src/components/marketplace/CheckoutForm.tsx", "marketplaceApi.createOrder"],
  ["src/components/marketplace/CheckoutForm.tsx", "marketplaceApi.checkout"],
  ["src/components/marketplace/CheckoutReturn.tsx", "marketplaceApi.order"],
  ["src/lib/marketplace/api.ts", "x-csrf-token"],
];

const forbidden = [
  "src/components/marketplace/CheckoutForm.tsx",
  "src/components/marketplace/AccountGate.tsx",
  "src/components/marketplace/AccountOrders.tsx",
  "src/components/marketplace/ProductActions.tsx",
  "src/components/marketplace/MarketplaceHeader.tsx",
  "src/components/marketplace/MarketplaceFooter.tsx",
];

for (const [relativePath, expected] of required) {
  const content = await read(relativePath);
  if (!content.includes(expected)) {
    throw new Error(`${relativePath} must include ${expected}`);
  }
}

for (const relativePath of forbidden) {
  const content = await read(relativePath);
  if (
    content.includes("localStorage") ||
    content.includes("Корзина") ||
    content.includes("Номер карты")
  ) {
    throw new Error(`${relativePath} contains retired client commerce state`);
  }
}

console.log("Marketplace API flow checks passed.");

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}
