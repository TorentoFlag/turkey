import assert from "node:assert/strict";
import test from "node:test";
import {
  runImport,
} from "./import-design-catalog.mjs";

const silent = { info() {} };

const root = {
  id: "root-id",
  name: "Туры",
  slug: "excursions",
  parentId: null,
  imageUrl: null,
  sortOrder: 0,
  isActive: true,
};

const child = {
  name: "Вертолёты",
  slug: "vip-transport-helicopters",
  parentSlug: "excursions",
  imageUrl: null,
  sortOrder: 0,
  isActive: true,
};

const product = {
  slug: "imported-product",
  title: "Импортируемый товар",
  description: "Описание импортируемого товара.",
  categorySlug: "vip-transport-helicopters",
  type: "booking",
  priceMinor: 10_400,
  currency: "RUB",
  sortOrder: 0,
  isActive: true,
  assetPath: "frontend/public/images/catalog-generated/rumeli-fortress.jpg",
};

const plan = {
  categories: { roots: [toPlanCategory(root)], children: [child] },
  products: [product],
};

test("is dry-run by default and does not issue mutation requests", async () => {
  const client = new FakeCatalogClient();

  const summary = await runImport({
    plan,
    client,
    imageRoot: "/unused",
    apply: false,
    logger: silent,
    validateAssets: async () => {},
    readPhoto: async () => ({ filename: "image.jpg", contentType: "image/jpeg", bytes: Buffer.from("photo") }),
  });

  assert.equal(client.mutations.length, 0);
  assert.deepEqual(summary, {
    createdCategories: 0,
    existingCategories: 0,
    createdProducts: 0,
    existingProducts: 0,
    conflicts: 0,
    failedUploads: 0,
    missingCategories: 2,
    missingProducts: 1,
  });
});

test("rejects a divergent existing slug before any mutation", async () => {
  const client = new FakeCatalogClient({
    categories: [root, { ...child, id: "child-id", parentId: root.id }],
    products: [
      {
        id: "product-id",
        ...product,
        categoryId: "child-id",
        title: "Другое название",
        imageUrl: "https://turkeyplanners.com/media/products/product/image.webp",
      },
    ],
  });

  await assert.rejects(
    () =>
      runImport({
        plan,
        client,
        imageRoot: "/unused",
        apply: true,
        logger: silent,
        validateAssets: async () => {},
        readPhoto: async () => ({ filename: "image.jpg", contentType: "image/jpeg", bytes: Buffer.from("photo") }),
      }),
    /conflicting product slug: imported-product/,
  );

  assert.equal(client.mutations.length, 0);
});

test("uploads one photo and creates only missing records in source order", async () => {
  const client = new FakeCatalogClient({ categories: [root] });
  const photoReads = [];

  const summary = await runImport({
    plan,
    client,
    imageRoot: "/unused",
    apply: true,
    logger: silent,
    validateAssets: async () => {},
    readPhoto: async (input) => {
      photoReads.push(input.slug);
      return {
        filename: "image.jpg",
        contentType: "image/jpeg",
        bytes: Buffer.from("photo"),
      };
    },
  });

  assert.deepEqual(
    client.mutations.map(({ kind, value }) => [kind, value.slug]),
    [
      ["category", "vip-transport-helicopters"],
      ["product", "imported-product"],
    ],
  );
  assert.deepEqual(photoReads, ["imported-product"]);
  assert.equal(client.mutations[1].value.categoryId, "category-2");
  assert.deepEqual(summary, {
    createdCategories: 1,
    existingCategories: 1,
    createdProducts: 1,
    existingProducts: 0,
    conflicts: 0,
    failedUploads: 0,
    missingCategories: 1,
    missingProducts: 1,
  });
});

function toPlanCategory(category) {
  return {
    name: category.name,
    slug: category.slug,
    parentSlug: null,
    imageUrl: null,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  };
}

class FakeCatalogClient {
  constructor({ categories = [], products = [] } = {}) {
    this.categories = [...categories];
    this.products = [...products];
    this.mutations = [];
  }

  async listCategories() {
    return this.categories;
  }

  async listProducts() {
    return this.products;
  }

  async createCategory(value) {
    const category = { id: `category-${this.categories.length + 1}`, ...value };
    this.categories.push(category);
    this.mutations.push({ kind: "category", value });
    return category;
  }

  async createProduct(value, photo) {
    this.products.push({ id: `product-${this.products.length + 1}`, ...value });
    this.mutations.push({ kind: "product", value, photo });
    return this.products.at(-1);
  }
}
