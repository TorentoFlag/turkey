import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildCatalogPlan,
  readDesignProducts,
} from "./design-catalog-source.mjs";

const maxPhotoBytes = 5_242_880;
const convertedAssetNames = new Map([
  [
    path.join(
      "frontend",
      "public",
      "images",
      "catalog-generated",
      "bursa-koza-han-market.jpg",
    ),
    "bursa-koza-han-market.webp",
  ],
  [
    path.join(
      "frontend",
      "public",
      "images",
      "home-sources",
      "cappadocia-cave-hotel.avif",
    ),
    "cappadocia-cave-hotel.webp",
  ],
]);
const managedImagePattern = /\/media\/products\/[0-9a-f-]+\/[0-9a-f-]+\.webp$/i;
const contentTypeByExtension = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

export async function runImport({
  plan,
  client,
  imageRoot,
  apply,
  logger,
  readPhoto: readPhotoForProduct = readPhoto,
  validateAssets = validateAllAssets,
}) {
  await validateAssets(plan, imageRoot);

  const [categories, products] = await Promise.all([
    client.listCategories(),
    client.listProducts(),
  ]);
  const comparison = compareCurrentCatalog(plan, { categories, products });
  if (comparison.conflicts.length > 0) {
    throw new Error(`conflicting ${comparison.conflicts[0]}`);
  }

  const summary = {
    createdCategories: 0,
    existingCategories: comparison.existingCategories,
    createdProducts: 0,
    existingProducts: comparison.existingProducts,
    conflicts: 0,
    failedUploads: 0,
    missingCategories: comparison.missingCategories.length,
    missingProducts: comparison.missingProducts.length,
  };
  if (!apply) {
    logger.info(summary);
    return summary;
  }

  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  for (const category of comparison.missingCategories) {
    const parent = category.parentSlug ? categoryBySlug.get(category.parentSlug) : null;
    if (category.parentSlug && !parent) {
      throw new Error(`missing parent category: ${category.parentSlug}`);
    }
    const created = await client.createCategory({
      name: category.name,
      slug: category.slug,
      parentId: parent?.id ?? null,
      imageUrl: category.imageUrl,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
    categoryBySlug.set(created.slug, created);
    summary.createdCategories += 1;
  }

  for (const product of comparison.missingProducts) {
    const category = categoryBySlug.get(product.categorySlug);
    if (!category) throw new Error(`missing product category: ${product.categorySlug}`);

    const photo = await readPhotoForProduct(product, imageRoot);
    try {
      await client.createProduct(
        {
          categoryId: category.id,
          title: product.title,
          slug: product.slug,
          description: product.description,
          type: product.type,
          priceMinor: product.priceMinor,
          currency: product.currency,
          sortOrder: product.sortOrder,
          isActive: product.isActive,
        },
        photo,
      );
      summary.createdProducts += 1;
    } catch (error) {
      summary.failedUploads += 1;
      throw error;
    }
  }

  logger.info(summary);
  return summary;
}

export function createHttpCatalogClient({ baseUrl, apiKey, actorId, fetcher = fetch }) {
  const request = async (method, pathname, body) => {
    const response = await fetcher(new URL(pathname, baseUrl), {
      method,
      headers: {
        accept: "application/json",
        "x-admin-api-key": apiKey,
        "x-admin-actor-id": actorId,
        ...(body instanceof FormData ? {} : body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined
        ? {}
        : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
    if (!response.ok) {
      throw new Error(`Admin API ${method} ${pathname} failed with ${response.status}.`);
    }
    return response.json();
  };

  return {
    listCategories: () => request("GET", "/v1/admin/categories"),
    listProducts: () => request("GET", "/v1/admin/products"),
    createCategory: (input) => request("POST", "/v1/admin/categories", input),
    createProduct: (input, photo) => {
      const formData = new FormData();
      formData.set("product", JSON.stringify(input));
      formData.set(
        "photo",
        new Blob([photo.bytes], { type: photo.contentType }),
        photo.filename,
      );
      return request("POST", "/v1/admin/products", formData);
    },
  };
}

export async function validateAllAssets(plan, imageRoot) {
  for (const product of plan.products) {
    const filePath = resolveAssetPath(product.assetPath, imageRoot);
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error(`missing photo asset: ${product.assetPath}`);
    if (file.size <= maxPhotoBytes && !convertedAssetNames.has(product.assetPath)) {
      assertSupportedAsset(product.assetPath);
      continue;
    }
    if (!convertedAssetNames.has(product.assetPath)) {
      throw new Error(`photo asset exceeds 5 MiB: ${product.assetPath}`);
    }
    await readPhoto(product, imageRoot);
  }
}

export async function readPhoto(product, imageRoot) {
  const filePath = resolveAssetPath(product.assetPath, imageRoot);
  const source = await readFile(filePath);
  const convertedFilename = convertedAssetNames.get(product.assetPath);
  const contentType = contentTypeByExtension.get(
    path.extname(product.assetPath).toLowerCase(),
  );
  if (source.byteLength <= maxPhotoBytes && contentType && !convertedFilename) {
    return {
      filename: path.basename(product.assetPath),
      contentType,
      bytes: source,
    };
  }
  if (!convertedFilename) {
    if (!contentType) throw new Error(`Unsupported photo asset: ${product.assetPath}`);
    throw new Error(`photo asset exceeds 5 MiB: ${product.assetPath}`);
  }

  const sharp = await loadSharp();
  const bytes = await sharp(source, {
    failOn: "error",
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({
      width: 2560,
      height: 2560,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  if (bytes.byteLength > maxPhotoBytes) {
    throw new Error("Compressed Bursa product photo exceeds 5 MiB.");
  }
  return {
    filename: convertedFilename,
    contentType: "image/webp",
    bytes,
  };
}

export function compareCurrentCatalog(plan, { categories, products }) {
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const expectedCategories = [...plan.categories.roots, ...plan.categories.children];
  const missingCategories = [];
  const conflicts = [];
  let existingCategories = 0;

  for (const category of expectedCategories) {
    const current = categoryBySlug.get(category.slug);
    if (!current) {
      missingCategories.push(category);
      continue;
    }
    const parentId = category.parentSlug ? categoryBySlug.get(category.parentSlug)?.id : null;
    if (
      parentId === undefined ||
      current.name !== category.name ||
      current.parentId !== parentId ||
      current.isActive !== category.isActive ||
      current.sortOrder !== category.sortOrder
    ) {
      conflicts.push(`category slug: ${category.slug}`);
      continue;
    }
    existingCategories += 1;
  }

  const missingProducts = [];
  let existingProducts = 0;
  for (const product of plan.products) {
    const current = productBySlug.get(product.slug);
    if (!current) {
      missingProducts.push(product);
      continue;
    }
    const categoryId = categoryBySlug.get(product.categorySlug)?.id;
    if (
      categoryId === undefined ||
      current.categoryId !== categoryId ||
      current.title !== product.title ||
      current.description !== product.description ||
      current.type !== product.type ||
      current.priceMinor !== product.priceMinor ||
      current.currency !== product.currency ||
      current.sortOrder !== product.sortOrder ||
      current.isActive !== product.isActive ||
      typeof current.imageUrl !== "string" ||
      !managedImagePattern.test(current.imageUrl)
    ) {
      conflicts.push(`product slug: ${product.slug}`);
      continue;
    }
    existingProducts += 1;
  }

  return { missingCategories, existingCategories, missingProducts, existingProducts, conflicts };
}

function resolveAssetPath(assetPath, imageRoot) {
  const root = path.resolve(imageRoot);
  const resolved = path.resolve(root, assetPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Invalid asset path: ${assetPath}`);
  }
  return resolved;
}

function assertSupportedAsset(assetPath) {
  const contentType = contentTypeByExtension.get(path.extname(assetPath).toLowerCase());
  if (!contentType) throw new Error(`Unsupported photo asset: ${assetPath}`);
  return contentType;
}

async function loadSharp() {
  const packageJsonPath = process.env.CATALOG_IMPORT_SHARP_PACKAGE_JSON ??
    (await pathExists("/app/package.json")
      ? "/app/package.json"
      : path.resolve("backend/package.json"));
  return createRequire(packageJsonPath)("sharp");
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some((argument) => argument !== "--apply")) {
    throw new Error("Usage: node import-design-catalog.mjs [--apply]");
  }
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) throw new Error("ADMIN_API_KEY is required.");
  const sourceProducts = readDesignProducts({
    sourcePath: path.join(repositoryRoot, "frontend/src/data/marketplace-sources.ts"),
  });
  const summary = await runImport({
    plan: buildCatalogPlan(sourceProducts),
    client: createHttpCatalogClient({
      baseUrl: process.env.CATALOG_IMPORT_API_BASE_URL ?? "http://api:3001",
      apiKey,
      actorId: process.env.CATALOG_IMPORT_ACTOR_ID ?? "catalog-import-2026-08-10",
    }),
    imageRoot: repositoryRoot,
    apply: arguments_.includes("--apply"),
    logger: { info: (value) => process.stdout.write(`${JSON.stringify(value)}\n`) },
  });
  if (!arguments_.includes("--apply") && (summary.conflicts > 0 || summary.failedUploads > 0)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Catalog import failed."}\n`);
    process.exitCode = 1;
  });
}
