import { pathToFileURL } from "node:url";

export const vipHelicopterProductSlugs = Object.freeze([
  "elithomes-helicopter-15-min",
  "elithomes-helicopter-20-min",
  "elithomes-helicopter-25-min",
  "elithomes-helicopter-airport-belek",
  "elithomes-helicopter-airport-kemer",
  "elithomes-helicopter-airport-alanya",
  "elithomes-helicopter-airport-dalaman",
  "elithomes-helicopter-airport-bodrum",
  "elithomes-helicopter-airport-cappadocia",
]);

const rootSlug = "vip-transport";
const childSlug = "vip-transport-helicopters";
const immutableProductFields = Object.freeze([
  "id",
  "slug",
  "title",
  "description",
  "imageUrl",
  "type",
  "priceMinor",
  "currency",
  "sortOrder",
  "isActive",
]);

export async function runVipHelicopterConsolidation({ client, apply, logger }) {
  const [categories, products] = await Promise.all([
    client.listCategories(),
    client.listProducts(),
  ]);
  const root = findExactlyOne(categories, rootSlug, "category");
  const child = categories.filter((category) => category.slug === childSlug);
  const plan = buildConsolidationPlan({ root, child, products });
  const summary = {
    productsToMove: plan.productsToMove.length,
    productsMoved: 0,
    categoryDeleted: false,
  };

  if (!apply) {
    logger.info(summary);
    return summary;
  }

  for (const product of plan.productsToMove) {
    const updated = await client.updateProduct(product.id, {
      categoryId: root.id,
    });
    assertMovedProduct(product, root, updated);
    summary.productsMoved += 1;
  }
  if (plan.child) {
    await client.deleteCategory(plan.child.id);
    summary.categoryDeleted = true;
  }

  logger.info(summary);
  return summary;
}

export function createHttpVipHelicopterClient({
  baseUrl,
  apiKey,
  actorId,
  fetcher = fetch,
}) {
  const request = async (method, pathname, body) => {
    const response = await fetcher(new URL(pathname, baseUrl), {
      method,
      headers: {
        accept: "application/json",
        "x-admin-api-key": apiKey,
        "x-admin-actor-id": actorId,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new Error(
        `Admin API ${method} ${pathname} failed with ${response.status}.`,
      );
    }
    return response.status === 204 ? undefined : response.json();
  };

  return {
    listCategories: () => request("GET", "/v1/admin/categories"),
    listProducts: () => request("GET", "/v1/admin/products"),
    updateProduct: (id, input) =>
      request("PATCH", `/v1/admin/products/${id}`, input),
    deleteCategory: (id) => request("DELETE", `/v1/admin/categories/${id}`),
  };
}

function buildConsolidationPlan({ root, child, products }) {
  if (root.parentId !== null) {
    throw new Error(`vip-transport must be a root category.`);
  }
  if (child.length > 1) {
    throw new Error(`expected exactly one category for slug: ${childSlug}`);
  }
  const helicopterCategory = child[0];
  if (helicopterCategory && helicopterCategory.parentId !== root.id) {
    throw new Error(`vip-transport-helicopters must belong to vip-transport.`);
  }

  const productsBySlug = new Map();
  for (const product of products) {
    if (!vipHelicopterProductSlugs.includes(product.slug)) continue;
    if (productsBySlug.has(product.slug)) {
      throw new Error(`expected exactly one product for slug: ${product.slug}`);
    }
    productsBySlug.set(product.slug, product);
  }
  const expectedProducts = vipHelicopterProductSlugs.map((slug) => {
    const product = productsBySlug.get(slug);
    if (!product) throw new Error(`missing product for slug: ${slug}`);
    if (
      product.categoryId !== root.id &&
      product.categoryId !== helicopterCategory?.id
    ) {
      throw new Error(`unexpected category for product: ${slug}`);
    }
    return product;
  });

  if (helicopterCategory) {
    const unexpected = products.find(
      (product) =>
        product.categoryId === helicopterCategory.id &&
        !vipHelicopterProductSlugs.includes(product.slug),
    );
    if (unexpected) {
      throw new Error(
        `unexpected product in vip-transport-helicopters: ${unexpected.slug}`,
      );
    }
  }

  return {
    child: helicopterCategory,
    productsToMove: expectedProducts.filter(
      (product) => product.categoryId !== root.id,
    ),
  };
}

function findExactlyOne(values, slug, entityType) {
  const matches = values.filter((value) => value.slug === slug);
  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${entityType} for slug: ${slug}`);
  }
  return matches[0];
}

function assertMovedProduct(previous, root, updated) {
  if (!updated || updated.categoryId !== root.id) {
    throw new Error(`unexpected category update for product: ${previous.slug}`);
  }
  for (const field of immutableProductFields) {
    if (updated[field] !== previous[field]) {
      throw new Error(`immutable field changed for product: ${previous.slug}`);
    }
  }
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some((argument) => argument !== "--apply")) {
    throw new Error("Usage: node consolidate-vip-helicopters.mjs [--apply]");
  }
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) throw new Error("ADMIN_API_KEY is required.");
  await runVipHelicopterConsolidation({
    client: createHttpVipHelicopterClient({
      baseUrl: process.env.CATALOG_IMPORT_API_BASE_URL ?? "http://api:3001",
      apiKey,
      actorId:
        process.env.CATALOG_IMPORT_ACTOR_ID ??
        "catalog-vip-consolidation-2026-08-11",
    }),
    apply: arguments_.includes("--apply"),
    logger: {
      info: (value) => process.stdout.write(`${JSON.stringify(value)}\n`),
    },
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "VIP category consolidation failed."}\n`,
    );
    process.exitCode = 1;
  });
}
