import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { readDesignProducts } from "./design-catalog-source.mjs";
import { readPhoto } from "./import-design-catalog.mjs";

const managedDestinationImagePattern =
  /\/media\/destinations\/[0-9a-f-]+\/[0-9a-f-]+\.webp$/i;

const destinationSeeds = [
  direction(
    "istanbul",
    "Стамбул",
    "Мраморноморский регион",
    "Город проливов, музеев и кварталов для долгих прогулок.",
    "images/istanbul-waterfront-heritage.webp",
  ),
  direction(
    "antalya",
    "Анталья",
    "Средиземноморье",
    "Побережье, старый город и удобные маршруты к природе.",
    "images/antalya-ruins.jpg",
  ),
  direction(
    "alanya",
    "Аланья",
    "Средиземноморье",
    "Крепость, бухты и неспешные морские дни.",
    "images/kas-coast.jpg",
  ),
  direction(
    "cappadocia",
    "Каппадокия",
    "Центральная Анатолия",
    "Долины, туфовые города и рассветные маршруты.",
    "images/cappadocia-dawn.jpg",
  ),
  direction(
    "marmaris",
    "Мармарис",
    "Эгейское побережье",
    "Бухты, сосны и выходы в море.",
    "images/aegean-bodrum.jpg",
  ),
  direction(
    "bodrum",
    "Бодрум",
    "Эгейское побережье",
    "Белые дома, набережные и островные горизонты.",
    "images/home-canvas/aegean-bodrum.webp",
  ),
  direction(
    "fethiye",
    "Фетхие",
    "Эгейское побережье",
    "Ликийские тропы и тихие лагуны.",
    "images/kas-coast.jpg",
  ),
  direction(
    "izmir",
    "Измир",
    "Эгейское побережье",
    "Городская набережная и выезды к античным местам.",
    "images/modern-downtown.jpg",
  ),
  direction(
    "kusadasi",
    "Кушадасы",
    "Эгейское побережье",
    "Приморская база для поездок к Эфесу.",
    "images/istanbul-modern.jpg",
  ),
  direction(
    "pamukkale",
    "Памуккале",
    "Эгейский регион",
    "Травертины и древний Иераполис.",
    "images/pamukkale.jpg",
  ),
  direction(
    "bursa",
    "Бурса",
    "Мраморноморский регион",
    "Османское наследие и горные маршруты.",
    "images/home-canvas/istanbul-legacy-hotel.webp",
  ),
  direction(
    "trabzon",
    "Трабзон",
    "Черноморский регион",
    "Зелёные плато и черноморское побережье.",
    "images/turkey-transfer-coast.webp",
  ),
  direction(
    "side",
    "Сиде",
    "Средиземноморье",
    "Античные руины рядом с морем.",
    "images/perge-ruins.jpg",
  ),
  direction(
    "belek",
    "Белек",
    "Средиземноморье",
    "Спокойный курорт и маршруты в окрестностях.",
    "images/antalya-ruins.jpg",
  ),
  direction(
    "kemer",
    "Кемер",
    "Средиземноморье",
    "Горы, сосны и небольшие пляжи.",
    "images/kas-coast.jpg",
  ),
];

export const designDestinations = Object.freeze(
  destinationSeeds.map((destination, sortOrder) =>
    Object.freeze({ ...destination, sortOrder, isActive: true }),
  ),
);

export function buildDestinationPlan(sourceProducts) {
  if (!Array.isArray(sourceProducts) || sourceProducts.length !== 93) {
    throw new Error("Expected exactly 93 design products.");
  }
  const destinationByName = new Map(
    designDestinations.map((destination) => [destination.name, destination]),
  );
  const memberships = [];
  for (const [sortOrder, product] of sourceProducts.entries()) {
    if (!product.city) continue;
    const destination = destinationByName.get(product.city);
    if (!destination) {
      throw new Error(`Unknown design product destination: ${product.city}`);
    }
    memberships.push({
      destinationSlug: destination.slug,
      productSlug: product.id,
      sortOrder,
    });
  }
  return { destinations: designDestinations, memberships };
}

export async function runDestinationImport({
  plan,
  client,
  imageRoot,
  apply,
  logger,
  readPhoto: readDestinationPhoto = readPhoto,
  validateAssets = validateDestinationAssets,
}) {
  await validateAssets(plan, imageRoot);
  const [directions, products] = await Promise.all([
    client.listDirections(),
    client.listProducts(),
  ]);
  const comparison = compareCurrentDirections(plan, { directions, products });
  if (comparison.conflicts.length > 0) {
    throw new Error(`conflicting ${comparison.conflicts[0]}`);
  }

  const summary = {
    createdDirections: 0,
    existingDirections: comparison.existingDirections,
    createdMemberships: 0,
    existingMemberships: comparison.existingMemberships,
    conflicts: 0,
    failedUploads: 0,
    missingDirections: comparison.missingDirections.length,
    missingMemberships: comparison.missingMemberships.length,
  };
  if (!apply) {
    logger.info(summary);
    return summary;
  }

  const directionBySlug = new Map(
    directions.map((direction) => [direction.slug, direction]),
  );
  for (const directionPlan of comparison.missingDirections) {
    const cover = await readDestinationPhoto(directionPlan, imageRoot);
    try {
      const created = await client.createDirection(
        toDirectionInput(directionPlan),
        cover,
      );
      directionBySlug.set(created.slug, created);
      summary.createdDirections += 1;
    } catch (error) {
      summary.failedUploads += 1;
      throw error;
    }
  }

  const productBySlug = new Map(
    products.map((product) => [product.slug, product]),
  );
  for (const membership of comparison.missingMemberships) {
    const direction = directionBySlug.get(membership.destinationSlug);
    const product = productBySlug.get(membership.productSlug);
    if (!direction || !product) {
      throw new Error(
        `missing direction or product for membership: ${membership.destinationSlug}/${membership.productSlug}`,
      );
    }
    await client.upsertMembership(direction.id, product.id, {
      sortOrder: membership.sortOrder,
    });
    summary.createdMemberships += 1;
  }

  logger.info(summary);
  return summary;
}

export function compareCurrentDirections(plan, { directions, products }) {
  const directionBySlug = new Map(
    directions.map((direction) => [direction.slug, direction]),
  );
  const productBySlug = new Map(
    products.map((product) => [product.slug, product]),
  );
  const missingDirections = [];
  const conflicts = [];
  let existingDirections = 0;

  for (const destination of plan.destinations) {
    const current = directionBySlug.get(destination.slug);
    if (!current) {
      missingDirections.push(destination);
      continue;
    }
    if (!matchesDirection(destination, current)) {
      conflicts.push(`destination slug: ${destination.slug}`);
      continue;
    }
    existingDirections += 1;
  }

  const missingMemberships = [];
  let existingMemberships = 0;
  for (const membership of plan.memberships) {
    const direction = directionBySlug.get(membership.destinationSlug);
    const product = productBySlug.get(membership.productSlug);
    if (!product) {
      conflicts.push(
        `membership: ${membership.destinationSlug}/${membership.productSlug}`,
      );
      continue;
    }
    if (!direction) {
      missingMemberships.push(membership);
      continue;
    }
    const current = direction.products?.find(
      (candidate) => candidate.productId === product.id,
    );
    if (!current) {
      missingMemberships.push(membership);
      continue;
    }
    if (current.sortOrder !== membership.sortOrder) {
      conflicts.push(
        `membership: ${membership.destinationSlug}/${membership.productSlug}`,
      );
      continue;
    }
    existingMemberships += 1;
  }

  return {
    missingDirections,
    existingDirections,
    missingMemberships,
    existingMemberships,
    conflicts,
  };
}

export function createHttpDestinationClient({
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
        ...(body instanceof FormData
          ? {}
          : body === undefined
            ? {}
            : { "content-type": "application/json" }),
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new Error(
        `Admin API ${method} ${pathname} failed with ${response.status}.`,
      );
    }
    return response.status === 204 ? undefined : response.json();
  };

  return {
    listDirections: () => request("GET", "/v1/admin/destinations"),
    listProducts: () => request("GET", "/v1/admin/products"),
    createDirection: (input, cover) => {
      const formData = new FormData();
      formData.set("destination", JSON.stringify(input));
      formData.set(
        "photo",
        new Blob([cover.bytes], { type: cover.contentType }),
        cover.filename,
      );
      return request("POST", "/v1/admin/destinations", formData);
    },
    upsertMembership: (destinationId, productId, input) =>
      request(
        "PUT",
        `/v1/admin/destinations/${destinationId}/products/${productId}`,
        input,
      ),
  };
}

export async function validateDestinationAssets(plan, imageRoot) {
  for (const destination of plan.destinations) {
    const filePath = resolveAssetPath(destination.assetPath, imageRoot);
    const file = await stat(filePath);
    if (!file.isFile())
      throw new Error(
        `missing direction cover asset: ${destination.assetPath}`,
      );
    await readPhoto(destination, imageRoot);
  }
}

function direction(slug, name, region, description, assetRelativePath) {
  return Object.freeze({
    slug,
    name,
    region,
    description,
    assetPath: path.join("frontend", "public", assetRelativePath),
  });
}

function matchesDirection(plan, current) {
  return (
    current.name === plan.name &&
    current.region === plan.region &&
    current.description === plan.description &&
    current.sortOrder === plan.sortOrder &&
    current.isActive === plan.isActive &&
    typeof current.imageUrl === "string" &&
    managedDestinationImagePattern.test(current.imageUrl)
  );
}

function toDirectionInput(directionPlan) {
  return {
    name: directionPlan.name,
    slug: directionPlan.slug,
    region: directionPlan.region,
    description: directionPlan.description,
    sortOrder: directionPlan.sortOrder,
    isActive: directionPlan.isActive,
  };
}

function resolveAssetPath(assetPath, imageRoot) {
  const root = path.resolve(imageRoot);
  const resolved = path.resolve(root, assetPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Invalid asset path: ${assetPath}`);
  }
  return resolved;
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some((argument) => argument !== "--apply")) {
    throw new Error("Usage: node import-design-destinations.mjs [--apply]");
  }
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) throw new Error("ADMIN_API_KEY is required.");
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const sourceProducts = readDesignProducts({
    sourcePath: path.join(
      repositoryRoot,
      "frontend/src/data/marketplace-sources.ts",
    ),
  });
  await runDestinationImport({
    plan: buildDestinationPlan(sourceProducts),
    client: createHttpDestinationClient({
      baseUrl: process.env.CATALOG_IMPORT_API_BASE_URL ?? "http://api:3001",
      apiKey,
      actorId:
        process.env.CATALOG_IMPORT_ACTOR_ID ?? "destination-import-2026-08-11",
    }),
    imageRoot: repositoryRoot,
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
      `${error instanceof Error ? error.message : "Destination import failed."}\n`,
    );
    process.exitCode = 1;
  });
}
