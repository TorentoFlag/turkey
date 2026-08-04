import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const expectedSections = [
  "Туры",
  "Билеты в музеи и достопримечательности",
  "Впечатления и экскурсии",
  "Рестораны",
  "Красота и wellness",
  "eSIM",
  "Трансферы",
  "Проездные",
];

test("marketplace catalog is a dated, source-backed snapshot in eight sections", () => {
  const {
    marketplaceCategories,
    marketplaceDestinations,
    marketplaceServiceVariants,
    marketplaceServices,
  } = require("../src/data/marketplace.ts");
  const { isCalendarDate } = require("../src/data/marketplace-sources.ts");

  assert.deepEqual(marketplaceCategories.map(({ name }) => name), expectedSections);
  assert.equal(marketplaceCategories.length, 8);
  assert.ok(marketplaceDestinations.length >= 15);
  assert.ok(marketplaceServices.length >= 40);

  const recordsBySection = new Map();
  for (const service of marketplaceServices) {
    recordsBySection.set(service.catalogSection, (recordsBySection.get(service.catalogSection) ?? 0) + 1);
    assert.ok(service.id);
    assert.ok(service.slug);
    assert.ok(service.title);
    assert.ok(service.description);
    assert.ok(service.price > 0, `${service.id} must have a positive RUB price`);
    assert.equal(service.currency, "RUB");
    assert.ok(service.priceUnit);
    assert.equal(service.availability, "snapshot");
    assert.equal(service.providerStatus, "awaiting_provider");
    assert.ok(service.sourcePrice > 0, `${service.id} must retain its original price`);
    assert.ok(["EUR", "TRY", "USD", "RUB"].includes(service.sourceCurrency));
    assert.equal(service.capturedAt, "2026-07-27");
    assert.ok(isCalendarDate(service.capturedAt), `${service.id} must have a real capture date`);
    assert.ok(service.sourceUrl.startsWith("https://"));
    assert.ok(service.imageSource);
    assert.equal("isMockData" in service, false);
    assert.equal("demoDates" in service, false);
    assert.equal(typeof service.orderToday, "boolean");
    assert.ok(existsSync(resolve(process.cwd(), "public", service.imagePath.slice(1))));
    assert.ok(service.images.every((imagePath) => existsSync(resolve(process.cwd(), "public", imagePath.slice(1)))));

    const isIstanbulSourceSection = ["Туры", "Билеты в музеи и достопримечательности", "Впечатления и экскурсии", "Рестораны", "Красота и wellness"].includes(service.catalogSection);
    if (isIstanbulSourceSection || service.provider === "Istanbul.com") {
      assert.equal(service.provider, "Istanbul.com", `${service.id} must be sourced from Istanbul.com`);
      assert.match(service.sourceUrl, /^https:\/\/istanbul\.com\//);
    } else {
      assert.equal(service.provider, "Trasst", `${service.id} must be sourced from Trasst`);
      assert.match(service.sourceUrl, /^https:\/\/(www\.)?trasst\.com\//);
    }
  }

  assert.deepEqual([...recordsBySection.keys()].sort(), [...expectedSections].sort());
  assert.ok([...recordsBySection.values()].every((count) => count >= 5));

  for (const variant of marketplaceServiceVariants) {
    assert.equal("isMockData" in variant, false);
    assert.equal(variant.availability, "snapshot");
    assert.equal(variant.providerStatus, "awaiting_provider");
    assert.ok(variant.sourcePrice > 0);
    assert.ok(isCalendarDate(variant.capturedAt));
  }
});

test("calendar-date validation rejects impossible snapshot dates", () => {
  const { isCalendarDate } = require("../src/data/marketplace-sources.ts");

  assert.equal(isCalendarDate("2026-07-27"), true);
  assert.equal(isCalendarDate("2026-02-30"), false);
  assert.equal(isCalendarDate("2026-13-01"), false);
  assert.equal(isCalendarDate("2026-7-27"), false);
});

test("catalog cards use a unique local cover per service", () => {
  const { marketplaceServices } = require("../src/data/marketplace.ts");
  const imagePaths = marketplaceServices.map(({ imagePath }) => imagePath);
  assert.equal(new Set(imagePaths).size, imagePaths.length, "each catalog service must have its own cover image");
});

test("marketplace links and images remain local and unambiguous", () => {
  const { marketplaceDestinations, marketplaceNavigation, marketplaceServices } = require("../src/data/marketplace.ts");

  for (const item of marketplaceNavigation) assert.ok(item.href.startsWith("/"));
  assert.equal(new Set(marketplaceServices.map(({ slug }) => slug)).size, marketplaceServices.length);

  for (const imagePath of [
    ...marketplaceDestinations.map(({ imagePath }) => imagePath),
    ...marketplaceServices.flatMap(({ imagePath, images }) => [imagePath, ...images]),
  ]) {
    assert.ok(imagePath.startsWith("/images/"));
    assert.ok(existsSync(resolve(process.cwd(), "public", imagePath.slice(1))));
  }
});

test("section filtering uses catalogSection and legacy scenarios keep their exact types", () => {
  const { filterMarketplaceServices } = require("../src/lib/marketplace/catalog.ts");

  for (const section of expectedSections) {
    const result = filterMarketplaceServices({ section }, "relevance", 1);
    assert.ok(result.items.length > 0, `${section} must be filterable`);
    assert.ok(result.items.every((service) => service.catalogSection === section));
  }

  const scenarioTypes = {
    transfer: new Set(["transfers", "taxi"]),
    "self-service": new Set(["digital", "connectivity", "insurance", "rental"]),
    experience: new Set(["excursions", "activities", "guides", "tickets", "yachts", "spa"]),
    support: new Set(["services", "visa", "insurance", "airline-tickets", "shopping"]),
  };
  for (const [scenario, types] of Object.entries(scenarioTypes)) {
    const result = filterMarketplaceServices({ scenario }, "relevance", 1);
    assert.ok(result.items.every((service) => types.has(service.type)), `${scenario} must not be broadened by section`);
  }
});

test("catalog sorting and non-availability date queries preserve the snapshot data", () => {
  const { filterMarketplaceServices } = require("../src/lib/marketplace/catalog.ts");
  const dated = filterMarketplaceServices({ date: "2026-08-15" }, "relevance", 1);
  assert.deepEqual(dated.items.map(({ id }) => id), []);

  const byPrice = filterMarketplaceServices({}, "price-asc", 1);
  assert.ok(byPrice.items.every((service, index, items) => index === 0 || items[index - 1].price <= service.price));
  const byDuration = filterMarketplaceServices({}, "duration", 1);
  assert.ok(byDuration.items.every((service, index, items) => index === 0 || (items[index - 1].durationMinutes ?? Infinity) <= (service.durationMinutes ?? Infinity)));
});

test("restaurant category remains visible from an experience scenario", () => {
  const { filterMarketplaceServices } = require("../src/lib/marketplace/catalog.ts");
  const result = filterMarketplaceServices({ scenario: "experience", category: "restaurants" }, "relevance", 1);

  assert.equal(result.total, 5);
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every((service) => service.type === "restaurants"));
});

test("restaurant quick-filter query is preserved when parsed from the URL", () => {
  const { parseCatalogQuery } = require("../src/lib/marketplace/query-state.ts");

  assert.deepEqual(parseCatalogQuery({ category: "restaurants" }), { category: "restaurants" });
});

test("checkout access requires an authenticated account", () => {
  const { canAccessCheckout } = require("../src/lib/marketplace/checkout-access.ts");

  assert.equal(canAccessCheckout(null), false);
  assert.equal(canAccessCheckout({ email: "" }), false);
  assert.equal(canAccessCheckout({ email: "traveler@example.com" }), true);
});

test("catalog accumulates visible pages without dropping the first page", () => {
  const { getVisibleMarketplaceServices, filterMarketplaceServices } = require("../src/lib/marketplace/catalog.ts");
  const firstPage = filterMarketplaceServices({}, "relevance", 1);
  const secondVisiblePage = getVisibleMarketplaceServices({}, "relevance", 2);

  assert.deepEqual(secondVisiblePage.items.slice(0, firstPage.items.length).map(({ id }) => id), firstPage.items.map(({ id }) => id));
  assert.equal(firstPage.items.length, 12);
  assert.equal(secondVisiblePage.items.length, 24);
});
