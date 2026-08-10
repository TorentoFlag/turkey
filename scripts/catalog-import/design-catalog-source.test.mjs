import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCatalogPlan,
  readDesignProducts,
} from "./design-catalog-source.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const designSourcePath = path.join(
  repositoryRoot,
  "frontend/src/data/marketplace-sources.ts",
);

test("maps all approved design records to the production taxonomy", () => {
  const sourceProducts = readDesignProducts({ sourcePath: designSourcePath });
  const plan = buildCatalogPlan(sourceProducts);

  assert.equal(plan.products.length, 93);
  assert.deepEqual(
    plan.categories.roots.map(({ slug }) => slug),
    [
      "excursions",
      "tickets",
      "activities",
      "restaurants",
      "spa",
      "connectivity",
      "transfers",
      "digital",
      "shopping",
      "vip-transport",
    ],
  );
  assert.deepEqual(
    plan.categories.children.map(({ slug }) => slug),
    [
      "shopping-fur",
      "shopping-jewelry",
      "vip-transport-helicopters",
    ],
  );

  assert.equal(
    plan.products.find(({ slug }) => slug === "blue-mosque-self-guided")
      ?.categorySlug,
    "activities",
  );
  assert.equal(
    plan.products.find(({ slug }) => slug === "trasst-esim-1gb")?.type,
    "auto_delivery",
  );
  assert.equal(
    plan.products.find(({ slug }) => slug === "turkishopping-black-mink-coat")
      ?.type,
    "physical",
  );
  assert.equal(
    plan.products.find(({ slug }) => slug === "istanbul-shuttle-aksaray")
      ?.type,
    "booking",
  );
  assert.equal(
    plan.products.find(({ slug }) => slug === "trasst-esim-1gb")?.priceMinor,
    10_400,
  );
});
