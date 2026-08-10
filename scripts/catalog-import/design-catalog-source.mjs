import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const roots = [
  ["excursions", "Туры"],
  ["tickets", "Билеты в музеи и достопримечательности"],
  ["activities", "Впечатления и экскурсии"],
  ["restaurants", "Рестораны"],
  ["spa", "Красота и wellness"],
  ["connectivity", "eSIM"],
  ["transfers", "Трансферы"],
  ["digital", "Проездные"],
  ["shopping", "Шопинг"],
  ["vip-transport", "VIP транспорт"],
];

const children = [
  ["shopping-fur", "Меха", "shopping"],
  ["shopping-jewelry", "Ювелирные изделия", "shopping"],
];

const typeByDesignType = new Map([
  ["connectivity", "auto_delivery"],
  ["tickets", "auto_delivery"],
  ["digital", "auto_delivery"],
  ["guides", "auto_delivery"],
  ["shopping", "physical"],
  ["excursions", "booking"],
  ["activities", "booking"],
  ["restaurants", "booking"],
  ["spa", "booking"],
  ["transfers", "booking"],
  ["vip-transport", "booking"],
]);

const categorySlugByDesignSubcategory = new Map([
  ["shopping:fur", "shopping-fur"],
  ["shopping:jewelry", "shopping-jewelry"],
  ["vip-transport:helicopters", "vip-transport"],
]);

export function readDesignProducts({ sourcePath }) {
  const source = readFileSync(sourcePath, "utf8");
  const executable = source
    .replace(/^import type[^\n]*\n/m, "")
    .replace(/^export type SourceProduct = \{[\s\S]*?^\};\n/m, "")
    .replace(/^export function isCalendarDate\([\s\S]*?^\}\n\n/m, "")
    .replace(/export const sourceProducts: SourceProduct\[\] =/, "const sourceProducts =")
    .replace(/export const /g, "const ")
    .replace(/ as const/g, "");
  const context = vm.createContext(Object.create(null));
  vm.runInContext(
    `${executable}\nglobalThis.catalog = { eurToRub, sourceProducts };`,
    context,
    { filename: sourcePath },
  );

  const catalog = context.catalog;
  if (!catalog || !Array.isArray(catalog.sourceProducts)) {
    throw new Error("Design catalog source did not expose sourceProducts.");
  }
  if (!Number.isInteger(catalog.eurToRub) || catalog.eurToRub <= 0) {
    throw new Error("Design catalog source has an invalid EUR-to-RUB rate.");
  }

  const knownIds = new Set();
  return catalog.sourceProducts.map((product) => {
    if (!isSourceProduct(product) || knownIds.has(product.id)) {
      throw new Error("Design catalog source has an invalid or duplicate product.");
    }
    knownIds.add(product.id);
    return { ...product, eurToRub: catalog.eurToRub };
  });
}

export function buildCatalogPlan(sourceProducts) {
  if (!Array.isArray(sourceProducts) || sourceProducts.length !== 93) {
    throw new Error("Expected exactly 93 design products.");
  }

  const products = sourceProducts.map((product, index) => {
    const type = typeByDesignType.get(product.type);
    if (!type) throw new Error(`Unknown design product type: ${product.type}`);

    const rootSlug = product.type === "guides" ? "activities" : product.type;
    const categorySlug = product.subcategory
      ? categorySlugByDesignSubcategory.get(`${product.type}:${product.subcategory}`)
      : rootSlug;
    if (!categorySlug) {
      throw new Error(`Unknown design subcategory: ${product.type}:${product.subcategory}`);
    }

    const priceRub = Math.round(product.sourcePrice * product.eurToRub);
    if (!Number.isSafeInteger(priceRub) || priceRub <= 0) {
      throw new Error(`Invalid displayed price for ${product.id}.`);
    }

    return {
      slug: product.id,
      title: product.title,
      description: product.description,
      categorySlug,
      type,
      priceMinor: priceRub * 100,
      currency: "RUB",
      sortOrder: index,
      isActive: true,
      assetPath: path.join("frontend", "public", product.imagePath.slice(1)),
    };
  });

  return {
    categories: {
      roots: roots.map(([slug, name], sortOrder) => ({
        name,
        slug,
        parentSlug: null,
        imageUrl: null,
        sortOrder,
        isActive: true,
      })),
      children: children.map(([slug, name, parentSlug], sortOrder) => ({
        name,
        slug,
        parentSlug,
        imageUrl: null,
        sortOrder,
        isActive: true,
      })),
    },
    products,
  };
}

function isSourceProduct(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    slugPattern.test(value.id) &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    typeof value.description === "string" &&
    value.description.trim().length > 0 &&
    typeof value.type === "string" &&
    typeof value.sourcePrice === "number" &&
    Number.isFinite(value.sourcePrice) &&
    value.sourcePrice > 0 &&
    typeof value.imagePath === "string" &&
    value.imagePath.startsWith("/images/") &&
    (value.subcategory === undefined || typeof value.subcategory === "string")
  );
}
