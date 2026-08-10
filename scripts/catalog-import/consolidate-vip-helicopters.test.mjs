import assert from "node:assert/strict";
import test from "node:test";
import {
  vipHelicopterProductSlugs,
  runVipHelicopterConsolidation,
} from "./consolidate-vip-helicopters.mjs";

const silent = { info() {} };
const root = { id: "vip-root", slug: "vip-transport", parentId: null };
const child = {
  id: "vip-helicopters",
  slug: "vip-transport-helicopters",
  parentId: root.id,
};

test("lists the nine approved helicopter products", () => {
  assert.equal(vipHelicopterProductSlugs.length, 9);
  assert.equal(new Set(vipHelicopterProductSlugs).size, 9);
});

test("dry-run plans nine category moves and no mutation", async () => {
  const client = new FakeCatalogClient({ products: helicopterProducts() });

  const summary = await runVipHelicopterConsolidation({
    client,
    apply: false,
    logger: silent,
  });

  assert.deepEqual(summary, {
    productsToMove: 9,
    productsMoved: 0,
    categoryDeleted: false,
  });
  assert.deepEqual(client.mutations, []);
});

test("moves only the known nine products and deletes the empty child category", async () => {
  const client = new FakeCatalogClient({ products: helicopterProducts() });

  const summary = await runVipHelicopterConsolidation({
    client,
    apply: true,
    logger: silent,
  });

  assert.deepEqual(
    client.mutations,
    vipHelicopterProductSlugs
      .map((slug, index) => [
        "product",
        `product-${index + 1}`,
        { categoryId: root.id },
        slug,
      ])
      .concat([["category", child.id]]),
  );
  assert.deepEqual(summary, {
    productsToMove: 9,
    productsMoved: 9,
    categoryDeleted: true,
  });
});

test("rejects unexpected child contents before issuing a mutation", async () => {
  const client = new FakeCatalogClient({
    products: [
      ...helicopterProducts(),
      product("unexpected-product", "unexpected"),
    ],
  });

  await assert.rejects(
    () =>
      runVipHelicopterConsolidation({ client, apply: true, logger: silent }),
    /unexpected product in vip-transport-helicopters: unexpected/,
  );
  assert.deepEqual(client.mutations, []);
});

function helicopterProducts() {
  return vipHelicopterProductSlugs.map((slug, index) =>
    product(`product-${index + 1}`, slug),
  );
}

function product(id, slug) {
  return {
    id,
    categoryId: child.id,
    slug,
    title: `Товар ${slug}`,
    description: "Описание товара.",
    imageUrl: `https://turkeyplanners.com/media/products/${id}/image.webp`,
    type: "booking",
    priceMinor: 10_000,
    currency: "RUB",
    sortOrder: 1,
    isActive: true,
  };
}

class FakeCatalogClient {
  constructor({ products }) {
    this.categories = [root, child];
    this.products = products.map((value) => ({ ...value }));
    this.mutations = [];
  }

  async listCategories() {
    return this.categories.map((value) => ({ ...value }));
  }

  async listProducts() {
    return this.products.map((value) => ({ ...value }));
  }

  async updateProduct(id, input) {
    const index = this.products.findIndex((value) => value.id === id);
    const updated = { ...this.products[index], ...input };
    this.products[index] = updated;
    this.mutations.push(["product", id, input, updated.slug]);
    return { ...updated };
  }

  async deleteCategory(id) {
    this.categories = this.categories.filter((value) => value.id !== id);
    this.mutations.push(["category", id]);
  }
}
