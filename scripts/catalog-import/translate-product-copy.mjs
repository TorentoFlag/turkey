import { pathToFileURL } from "node:url";

export const russianTitleTranslations = Object.freeze([
  Object.freeze({
    slug: "rhythm-dance-show",
    expectedTitle: "Rhythm Dance Show",
    title: "Танцевальное шоу Rhythm",
  }),
  Object.freeze({
    slug: "zippline-nakkastepe",
    expectedTitle: "Zippline Nakkastepe Adventure",
    title: "Зиплайн над Наккатепе",
  }),
]);

const immutableProductFields = Object.freeze([
  "id",
  "categoryId",
  "slug",
  "description",
  "imageUrl",
  "type",
  "priceMinor",
  "currency",
  "sortOrder",
  "isActive",
]);

export async function runProductCopyTranslation({ client, apply, logger }) {
  const products = await client.listProducts();
  const updates = russianTitleTranslations.map((translation) =>
    buildUpdatePlan(products, translation),
  );
  const summary = {
    plannedUpdates: updates.length,
    appliedUpdates: 0,
    slugs: updates.map(({ translation }) => translation.slug),
  };

  if (!apply) {
    logger.info(summary);
    return summary;
  }

  for (const update of updates) {
    const updated = await client.updateProduct(update.product.id, {
      title: update.translation.title,
    });
    assertUpdatedProduct(update, updated);
    summary.appliedUpdates += 1;
  }

  logger.info(summary);
  return summary;
}

export function createHttpProductCopyClient({
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
    return response.json();
  };

  return {
    listProducts: () => request("GET", "/v1/admin/products"),
    updateProduct: (id, input) =>
      request("PATCH", `/v1/admin/products/${id}`, input),
  };
}

function buildUpdatePlan(products, translation) {
  const matches = products.filter(
    (product) => product.slug === translation.slug,
  );
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one product for slug: ${translation.slug}`,
    );
  }
  const product = matches[0];
  if (product.title !== translation.expectedTitle) {
    throw new Error(
      `expected title drift for product slug: ${translation.slug}`,
    );
  }
  return {
    product,
    immutableSnapshot: Object.fromEntries(
      immutableProductFields.map((field) => [field, product[field]]),
    ),
    translation,
  };
}

function assertUpdatedProduct(update, updated) {
  if (!updated || updated.title !== update.translation.title) {
    throw new Error(
      `unexpected updated title for product slug: ${update.translation.slug}`,
    );
  }
  for (const field of immutableProductFields) {
    if (updated[field] !== update.immutableSnapshot[field]) {
      throw new Error(
        `immutable field changed for product slug: ${update.translation.slug}`,
      );
    }
  }
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some((argument) => argument !== "--apply")) {
    throw new Error("Usage: node translate-product-copy.mjs [--apply]");
  }
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) throw new Error("ADMIN_API_KEY is required.");
  const summary = await runProductCopyTranslation({
    client: createHttpProductCopyClient({
      baseUrl: process.env.CATALOG_IMPORT_API_BASE_URL ?? "http://api:3001",
      apiKey,
      actorId:
        process.env.CATALOG_IMPORT_ACTOR_ID ??
        "catalog-copy-translation-2026-08-10",
    }),
    apply: arguments_.includes("--apply"),
    logger: {
      info: (value) => process.stdout.write(`${JSON.stringify(value)}\n`),
    },
  });
  return summary;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Product copy translation failed."}\n`,
    );
    process.exitCode = 1;
  });
}
