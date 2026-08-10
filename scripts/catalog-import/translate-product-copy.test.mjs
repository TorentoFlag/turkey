import assert from "node:assert/strict";
import test from "node:test";
import {
  createHttpProductCopyClient,
  russianTitleTranslations,
  runProductCopyTranslation,
} from "./translate-product-copy.mjs";

const silent = { info() {} };

const sourceProducts = [
  product({
    id: "rhythm-id",
    slug: "rhythm-dance-show",
    title: "Rhythm Dance Show",
  }),
  product({
    id: "zippline-id",
    slug: "zippline-nakkastepe",
    title: "Zippline Nakkastepe Adventure",
  }),
  product({ id: "unrelated-id", slug: "cat", title: "кот нормальный" }),
];

test("contains exactly the two approved title translations", () => {
  assert.deepEqual(russianTitleTranslations, [
    {
      slug: "rhythm-dance-show",
      expectedTitle: "Rhythm Dance Show",
      title: "Танцевальное шоу Rhythm",
    },
    {
      slug: "zippline-nakkastepe",
      expectedTitle: "Zippline Nakkastepe Adventure",
      title: "Зиплайн над Наккатепе",
    },
  ]);
});

test("Admin API transport sends only a JSON title to the product PATCH endpoint", async () => {
  const calls = [];
  const client = createHttpProductCopyClient({
    baseUrl: "http://api:3001",
    apiKey: "test-key",
    actorId: "test-actor",
    fetcher: async (url, init) => {
      calls.push({ url: url.toString(), init });
      return new Response(JSON.stringify([]), { status: 200 });
    },
  });

  await client.listProducts();
  await client.updateProduct("product-id", { title: "Русский заголовок" });

  assert.deepEqual(calls, [
    {
      url: "http://api:3001/v1/admin/products",
      init: {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-admin-api-key": "test-key",
          "x-admin-actor-id": "test-actor",
        },
      },
    },
    {
      url: "http://api:3001/v1/admin/products/product-id",
      init: {
        method: "PATCH",
        headers: {
          accept: "application/json",
          "x-admin-api-key": "test-key",
          "x-admin-actor-id": "test-actor",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Русский заголовок" }),
      },
    },
  ]);
});

test("dry-run reports the complete plan without issuing updates", async () => {
  const client = new FakeProductClient(sourceProducts);

  const summary = await runProductCopyTranslation({
    client,
    apply: false,
    logger: silent,
  });

  assert.deepEqual(summary, {
    plannedUpdates: 2,
    appliedUpdates: 0,
    slugs: ["rhythm-dance-show", "zippline-nakkastepe"],
  });
  assert.equal(client.updateCalls.length, 0);
});

test("rejects a drifted title before issuing any update", async () => {
  const client = new FakeProductClient(
    sourceProducts.map((value) =>
      value.slug === "rhythm-dance-show"
        ? { ...value, title: "Редакторское название" }
        : value,
    ),
  );

  await assert.rejects(
    () => runProductCopyTranslation({ client, apply: true, logger: silent }),
    /expected title drift for product slug: rhythm-dance-show/,
  );
  assert.equal(client.updateCalls.length, 0);
});

test("rejects a missing target slug before issuing any update", async () => {
  const client = new FakeProductClient(
    sourceProducts.filter((value) => value.slug !== "zippline-nakkastepe"),
  );

  await assert.rejects(
    () => runProductCopyTranslation({ client, apply: true, logger: silent }),
    /expected exactly one product for slug: zippline-nakkastepe/,
  );
  assert.equal(client.updateCalls.length, 0);
});

test("rejects a duplicate target slug before issuing any update", async () => {
  const client = new FakeProductClient([
    ...sourceProducts,
    product({
      id: "duplicate-rhythm-id",
      slug: "rhythm-dance-show",
      title: "Rhythm Dance Show",
    }),
  ]);

  await assert.rejects(
    () => runProductCopyTranslation({ client, apply: true, logger: silent }),
    /expected exactly one product for slug: rhythm-dance-show/,
  );
  assert.equal(client.updateCalls.length, 0);
});

test("updates only titles in approved serial order and preserves returned immutable fields", async () => {
  const client = new FakeProductClient(sourceProducts);

  const summary = await runProductCopyTranslation({
    client,
    apply: true,
    logger: silent,
  });

  assert.deepEqual(
    client.updateCalls.map(({ id, input }) => [id, input]),
    [
      ["rhythm-id", { title: "Танцевальное шоу Rhythm" }],
      ["zippline-id", { title: "Зиплайн над Наккатепе" }],
    ],
  );
  assert.deepEqual(summary, {
    plannedUpdates: 2,
    appliedUpdates: 2,
    slugs: ["rhythm-dance-show", "zippline-nakkastepe"],
  });
});

test("rejects an API response that changes an immutable field", async () => {
  const client = new FakeProductClient(sourceProducts, {
    mutateReturnedProduct: (value) => ({
      ...value,
      priceMinor: value.priceMinor + 1,
    }),
  });

  await assert.rejects(
    () => runProductCopyTranslation({ client, apply: true, logger: silent }),
    /immutable field changed for product slug: rhythm-dance-show/,
  );
  assert.equal(client.updateCalls.length, 1);
});

function product({ id, slug, title }) {
  return {
    id,
    categoryId: "category-id",
    slug,
    title,
    description: "Русское описание товара.",
    imageUrl: "https://turkeyplanners.com/media/products/product/image.webp",
    type: "booking",
    priceMinor: 12_500,
    currency: "RUB",
    sortOrder: 3,
    isActive: true,
  };
}

class FakeProductClient {
  constructor(products, { mutateReturnedProduct = (value) => value } = {}) {
    this.products = products.map((value) => ({ ...value }));
    this.updateCalls = [];
    this.mutateReturnedProduct = mutateReturnedProduct;
  }

  async listProducts() {
    return this.products.map((value) => ({ ...value }));
  }

  async updateProduct(id, input) {
    this.updateCalls.push({ id, input });
    const index = this.products.findIndex((value) => value.id === id);
    const updated = { ...this.products[index], ...input };
    this.products[index] = updated;
    return this.mutateReturnedProduct({ ...updated });
  }
}
