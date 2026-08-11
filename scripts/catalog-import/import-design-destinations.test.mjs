import assert from "node:assert/strict";
import test from "node:test";

import { runDestinationImport } from "./import-design-destinations.mjs";

const silent = { info() {} };

const plan = {
  destinations: [
    {
      slug: "istanbul",
      name: "Стамбул",
      region: "Мраморноморский регион",
      description: "Город проливов, музеев и кварталов для долгих прогулок.",
      assetPath: "frontend/public/images/istanbul-waterfront-heritage.webp",
      sortOrder: 0,
      isActive: true,
    },
    {
      slug: "bursa",
      name: "Бурса",
      region: "Мраморноморский регион",
      description: "Османское наследие и горные маршруты.",
      assetPath:
        "frontend/public/images/home-canvas/istanbul-legacy-hotel.webp",
      sortOrder: 1,
      isActive: true,
    },
  ],
  memberships: [
    {
      destinationSlug: "istanbul",
      productSlug: "bosphorus-walk",
      sortOrder: 0,
    },
  ],
};

const product = { id: "product-istanbul", slug: "bosphorus-walk" };
const existingIstanbul = {
  id: "destination-istanbul",
  ...plan.destinations[0],
  imageUrl:
    "https://turkeyplanners.com/media/destinations/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.webp",
  products: [
    {
      destinationId: "destination-istanbul",
      productId: product.id,
      sortOrder: 0,
    },
  ],
};

test("dry-run reports the missing directions and memberships without mutations", async () => {
  const client = new FakeDestinationClient({ products: [product] });

  const summary = await runDestinationImport({
    plan,
    client,
    imageRoot: "/unused",
    apply: false,
    logger: silent,
    validateAssets: async () => {},
    readPhoto: async () => photo(),
  });

  assert.deepEqual(summary, {
    createdDirections: 0,
    existingDirections: 0,
    createdMemberships: 0,
    existingMemberships: 0,
    conflicts: 0,
    failedUploads: 0,
    missingDirections: 2,
    missingMemberships: 1,
  });
  assert.deepEqual(client.mutations, []);
});

test("creates missing directions with covers before creating their product memberships", async () => {
  const client = new FakeDestinationClient({ products: [product] });
  const uploaded = [];

  const summary = await runDestinationImport({
    plan,
    client,
    imageRoot: "/unused",
    apply: true,
    logger: silent,
    validateAssets: async () => {},
    readPhoto: async (direction) => {
      uploaded.push(direction.slug);
      return photo();
    },
  });

  assert.deepEqual(uploaded, ["istanbul", "bursa"]);
  assert.deepEqual(
    client.mutations.map(({ kind, value }) => [
      kind,
      value.slug ?? value.destinationId,
    ]),
    [
      ["direction", "istanbul"],
      ["direction", "bursa"],
      ["membership", "destination-1"],
    ],
  );
  assert.deepEqual(summary, {
    createdDirections: 2,
    existingDirections: 0,
    createdMemberships: 1,
    existingMemberships: 0,
    conflicts: 0,
    failedUploads: 0,
    missingDirections: 2,
    missingMemberships: 1,
  });
});

test("is idempotent after the expected directions and memberships exist", async () => {
  const client = new FakeDestinationClient({
    products: [product],
    directions: [
      existingIstanbul,
      {
        id: "destination-bursa",
        ...plan.destinations[1],
        imageUrl:
          "https://turkeyplanners.com/media/destinations/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444.webp",
        products: [],
      },
    ],
  });

  const summary = await runDestinationImport({
    plan,
    client,
    imageRoot: "/unused",
    apply: true,
    logger: silent,
    validateAssets: async () => {},
    readPhoto: async () => {
      throw new Error("existing directions must not upload new covers");
    },
  });

  assert.deepEqual(summary, {
    createdDirections: 0,
    existingDirections: 2,
    createdMemberships: 0,
    existingMemberships: 1,
    conflicts: 0,
    failedUploads: 0,
    missingDirections: 0,
    missingMemberships: 0,
  });
  assert.deepEqual(client.mutations, []);
});

test("rejects an existing direction that diverges before issuing mutations", async () => {
  const client = new FakeDestinationClient({
    products: [product],
    directions: [
      { ...existingIstanbul, description: "Изменённое вручную описание." },
    ],
  });

  await assert.rejects(
    () =>
      runDestinationImport({
        plan,
        client,
        imageRoot: "/unused",
        apply: true,
        logger: silent,
        validateAssets: async () => {},
        readPhoto: async () => photo(),
      }),
    /conflicting destination slug: istanbul/,
  );
  assert.deepEqual(client.mutations, []);
});

function photo() {
  return {
    filename: "cover.webp",
    contentType: "image/webp",
    bytes: Buffer.from("photo"),
  };
}

class FakeDestinationClient {
  constructor({ directions = [], products = [] } = {}) {
    this.directions = directions.map((direction) => ({ ...direction }));
    this.products = products.map((value) => ({ ...value }));
    this.mutations = [];
  }

  async listDirections() {
    return this.directions.map((direction) => ({
      ...direction,
      products: direction.products.map((membership) => ({ ...membership })),
    }));
  }

  async listProducts() {
    return this.products.map((value) => ({ ...value }));
  }

  async createDirection(value, cover) {
    const direction = {
      id: `destination-${this.directions.length + 1}`,
      ...value,
      imageUrl: `https://turkeyplanners.com/media/destinations/${this.directions.length + 1}/cover.webp`,
      products: [],
    };
    this.directions.push(direction);
    this.mutations.push({ kind: "direction", value, cover });
    return { ...direction };
  }

  async upsertMembership(destinationId, productId, value) {
    this.mutations.push({
      kind: "membership",
      value: { destinationId, productId, ...value },
    });
    const direction = this.directions.find(
      (candidate) => candidate.id === destinationId,
    );
    direction.products.push({
      destinationId,
      productId,
      sortOrder: value.sortOrder,
    });
  }
}
