import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const typescript = require("typescript");
const projectRoot = process.cwd();

require.extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

test("catalog query state parses typed filters and serializes supported values", () => {
  const { parseCatalogQuery, serializeCatalogQuery } = require(
    "../src/lib/marketplace/query-state.ts",
  );

  assert.deepEqual(
    parseCatalogQuery({ q: "Каппадокия", date: "2026-08-15", digital: "1", maxPrice: "1000" }),
    { text: "Каппадокия", date: "2026-08-15", digital: true, maxPrice: 1000 },
  );
  assert.deepEqual(
    parseCatalogQuery({ date: "2026-02-30", minPrice: "not-a-number", maxPrice: "Infinity" }),
    {},
  );
  assert.deepEqual(
    parseCatalogQuery({ destination: "not-a-real-place" }),
    {},
    "unknown destination filters must be discarded before they reach the catalog UI",
  );

  const filters = {
    text: "Каппадокия",
    category: "digital",
    destination: "cappadocia",
    date: "2026-08-15",
    minPrice: 100,
    maxPrice: 1000,
    duration: "full-day",
    language: "Русский",
    transfer: true,
    children: true,
    digital: true,
    orderToday: true,
  };

  const serialized = serializeCatalogQuery(filters);
  assert.equal(
    serialized,
    "q=%D0%9A%D0%B0%D0%BF%D0%BF%D0%B0%D0%B4%D0%BE%D0%BA%D0%B8%D1%8F&category=digital&destination=cappadocia&date=2026-08-15&minPrice=100&maxPrice=1000&duration=full-day&language=%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9&transfer=1&kids=1&digital=1&today=1",
  );
  assert.deepEqual(parseCatalogQuery(Object.fromEntries(new URLSearchParams(serialized))), filters);
  assert.equal(serializeCatalogQuery({ text: "", digital: false }), "");
});

test("search query state filters catalog results and keeps an empty query unfiltered", () => {
  const { parseCatalogQuery } = require("../src/lib/marketplace/query-state.ts");
  const { filterMarketplaceServices } = require("../src/lib/marketplace/catalog.ts");

  const searchFilters = parseCatalogQuery({ q: "  Каппадокия  " });
  const searchResults = filterMarketplaceServices(searchFilters, "relevance");
  const catalogResults = filterMarketplaceServices({}, "relevance");
  const emptySearchFilters = parseCatalogQuery({ q: "   " });
  const emptySearchResults = filterMarketplaceServices(emptySearchFilters, "relevance");

  assert.deepEqual(searchFilters, { text: "Каппадокия" });
  assert.ok(searchResults.total > 0, "a search query should return matching catalog results");
  assert.ok(
    searchResults.total < catalogResults.total,
    "a search query should narrow the catalog rather than return its full result set",
  );
  assert.deepEqual(emptySearchFilters, {}, "an empty search query should not create filters");
  assert.deepEqual(
    emptySearchResults,
    catalogResults,
    "an empty search query should keep the catalog unfiltered",
  );
});

test("catalog pagination returns the next page without repeating results", () => {
  const { filterMarketplaceServices } = require("../src/lib/marketplace/catalog.ts");
  const firstPage = filterMarketplaceServices({}, "relevance", 1);
  const secondPage = filterMarketplaceServices({}, "relevance", 2);

  assert.notDeepEqual(
    firstPage.items.map(({ id }) => id),
    secondPage.items.map(({ id }) => id),
  );
});

async function buildMarketplaceExport(buildRoot) {
  const next = spawn(
    process.execPath,
    [join(projectRoot, "node_modules/next/dist/bin/next"), "build", "--webpack"],
    { cwd: buildRoot, stdio: "pipe" },
  );
  let output = "";
  next.stdout?.on("data", (chunk) => { output += chunk; });
  next.stderr?.on("data", (chunk) => { output += chunk; });

  const exitCode = await new Promise((resolve, reject) => {
    next.once("error", reject);
    next.once("exit", resolve);
  });

  if (exitCode !== 0) {
    throw new Error(`Catalog export build failed with code ${exitCode}: ${output}`);
  }

  const { marketplaceDestinations } = require("../src/data/marketplace.ts");
  const exportedRoutes = new Map();
  for (const route of [
    "catalog",
    "search",
    "destinations",
    ...marketplaceDestinations.map(({ slug }) => `destinations/${slug}`),
  ]) {
    const candidates = [
      join(buildRoot, "out", route, "index.html"),
      join(buildRoot, "out", "turkiye", route, "index.html"),
    ];
    const html = candidates.find(existsSync);
    assert.ok(html, `${route} export should contain static HTML`);
    exportedRoutes.set(route, html);
  }

  const notFound = [
    join(buildRoot, "out", "404.html"),
    join(buildRoot, "out", "turkiye", "404.html"),
  ].find(existsSync);
  assert.ok(notFound, "export should contain the project 404 route");

  return { exportedRoutes, notFound };
}

async function startStaticServer(exportedRoutes, notFound) {
  const server = createServer(async (request, response) => {
    const requestedUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const requestedRoute = `${requestedUrl.pathname}${requestedUrl.search}`;
    const route = requestedUrl.pathname.replace(/^\//, "").replace(/\/$/, "");
    const html = exportedRoutes.get(route);

    if (!html) {
      response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      response.end(await readFile(notFound, "utf8"));
      return;
    }

    try {
      const content = await readFile(html, "utf8");
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "x-marketplace-route": requestedRoute,
      });
      response.end(content);
    } catch {
      response.writeHead(500).end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string", "static server should listen on a local port");

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

test("catalog and search routes serve each required query from a temporary static server", async (t) => {
  const buildRoot = await mkdtemp(join(tmpdir(), "marketplace-catalog-route-"));
  let staticServer;
  t.after(async () => {
    await staticServer?.close();
    await rm(buildRoot, { force: true, recursive: true });
  });
  await Promise.all([
    cp(join(projectRoot, "src"), join(buildRoot, "src"), { recursive: true }),
    cp(join(projectRoot, "next.config.ts"), join(buildRoot, "next.config.ts")),
    cp(join(projectRoot, "package.json"), join(buildRoot, "package.json")),
    cp(join(projectRoot, "tsconfig.json"), join(buildRoot, "tsconfig.json")),
    symlink(join(projectRoot, "node_modules"), join(buildRoot, "node_modules"), "dir"),
    symlink(join(projectRoot, "public"), join(buildRoot, "public"), "dir"),
  ]);
  const { exportedRoutes, notFound } = await buildMarketplaceExport(buildRoot);
  staticServer = await startStaticServer(exportedRoutes, notFound);

  const cases = [
    ["/catalog", /Соберите поездку в Турцию/],
    ["/catalog?q=%D0%9A%D0%B0%D0%BF%D0%BF%D0%B0%D0%B4%D0%BE%D0%BA%D0%B8%D1%8F", /Соберите поездку в Турцию/],
    ["/catalog?date=2026-08-15", /Соберите поездку в Турцию/],
    ["/catalog?digital=1", /Соберите поездку в Турцию/],
    ["/catalog?maxPrice=1000", /Соберите поездку в Турцию/],
    ["/search", /Поиск по каталогу/],
    ["/search?q=%D0%9A%D0%B0%D0%BF%D0%BF%D0%B0%D0%B4%D0%BE%D0%BA%D0%B8%D1%8F", /Поиск по каталогу/],
  ];

  for (const [path, heading] of cases) {
    const response = await fetch(`${staticServer.origin}${path}`);
    const html = await response.text();

    assert.equal(response.status, 200, `${path} should return HTTP 200`);
    assert.equal(response.headers.get("x-marketplace-route"), path, `${path} should reach the static server unchanged`);
    assert.match(html, heading, `${path} should return the expected marketplace shell`);
    assert.match(html, /Загружаем каталог…/, `${path} should retain the client query-state loading marker`);
  }
});

test("destination routes export every slug and use the project 404 page for unknown destinations", async (t) => {
  const buildRoot = await mkdtemp(join(tmpdir(), "marketplace-destination-route-"));
  let staticServer;
  t.after(async () => {
    await staticServer?.close();
    await rm(buildRoot, { force: true, recursive: true });
  });
  await Promise.all([
    cp(join(projectRoot, "src"), join(buildRoot, "src"), { recursive: true }),
    cp(join(projectRoot, "next.config.ts"), join(buildRoot, "next.config.ts")),
    cp(join(projectRoot, "package.json"), join(buildRoot, "package.json")),
    cp(join(projectRoot, "tsconfig.json"), join(buildRoot, "tsconfig.json")),
    symlink(join(projectRoot, "node_modules"), join(buildRoot, "node_modules"), "dir"),
    symlink(join(projectRoot, "public"), join(buildRoot, "public"), "dir"),
  ]);
  const { exportedRoutes, notFound } = await buildMarketplaceExport(buildRoot);
  staticServer = await startStaticServer(exportedRoutes, notFound);

  const { marketplaceDestinations } = require("../src/data/marketplace.ts");
  assert.equal(
    exportedRoutes.size,
    marketplaceDestinations.length + 3,
    "the destination index and every centralized destination slug should be exported",
  );

  for (const destination of marketplaceDestinations.slice(0, 5)) {
    const response = await fetch(`${staticServer.origin}/destinations/${destination.slug}`);
    const html = await response.text();

    assert.equal(response.status, 200, `${destination.slug} should return HTTP 200`);
    assert.match(html, new RegExp(destination.name), `${destination.slug} should render its name`);
  }

  const unknownResponse = await fetch(`${staticServer.origin}/destinations/not-a-real-place`);
  const unknownHtml = await unknownResponse.text();
  assert.equal(unknownResponse.status, 404, "unknown destination slugs should render the project 404 response");
  assert.match(unknownHtml, /404|not found/i, "unknown destination slugs should render not-found HTML");
});

test("search entry points use real paths instead of hash-only targets", () => {
  const header = readFileSync(resolve(projectRoot, "src/components/marketplace/MarketplaceHeader.tsx"), "utf8");
  const browser = readFileSync(resolve(projectRoot, "src/components/marketplace/CatalogBrowser.tsx"), "utf8");
  const searchPage = readFileSync(resolve(projectRoot, "src/app/search/page.tsx"), "utf8");

  assert.match(header, /href="\/search"/, "header search action should target /search");
  assert.doesNotMatch(header, /href="#/, "header should not add hash-only links");
  assert.doesNotMatch(browser, /href="#/, "catalog quick filters should not add hash-only links");
  assert.match(
    searchPage,
    /<Link href="\/catalog">Начать путешествие<\/Link>/,
    "the marketplace search quick action should start in the catalog",
  );
  assert.doesNotMatch(searchPage, /href="#/, "search should not add hash-only links");
  assert.doesNotMatch(
    searchPage,
    /searchParams|Показываем варианты по запросу/,
    "static search HTML must not depend on a query value that is unavailable during export",
  );
  assert.match(
    searchPage,
    /Здесь можно искать по названию, городу или фильтрам/,
    "search should keep a generic export-safe introduction",
  );
});

test("home collections navigate to filtered marketplace routes and keep full hover galleries alive", () => {
  const homeData = readFileSync(resolve(projectRoot, "src/data/home.ts"), "utf8");
  const collections = readFileSync(resolve(projectRoot, "src/components/home/Collections.tsx"), "utf8");

  for (const route of [
    "/catalog?destination=istanbul",
    "/catalog?destination=antalya",
    "/catalog?destination=cappadocia",
    "/catalog?region=aegean",
    "/catalog?category=services",
  ]) {
    assert.ok(homeData.includes(`href: "${route}"`), `${route} must be a real filtered catalog target`);
  }
  assert.match(collections, /<Link[\s\S]*href=\{item\.href\}/, "collection rows must navigate as links");
  assert.doesNotMatch(collections, /onMouseLeave=\{stopPreview\}/, "row hover must not stop the gallery during layout movement");
  assert.match(collections, /setInterval\(/, "collection hover must rotate through the complete image sequence");
  assert.equal((homeData.match(/\/images\//g) ?? []).length > 20, true, "collections must have a substantial local image gallery");
});

test("home idea cards navigate to free travel guides", () => {
  const homePage = readFileSync(resolve(projectRoot, "src/app/page.tsx"), "utf8");

  for (const route of [
    "/guides/istanbul-first-trip",
    "/guides/antalya-without-rush",
    "/guides/cappadocia-without-car",
  ]) {
    assert.ok(homePage.includes(`href="${route}"`), `${route} must be a real guide destination`);
  }
  assert.doesNotMatch(homePage, /href="#bundles"[^>]*aria-label="Стамбул впервые/, "Istanbul card must not be a section anchor");
  assert.doesNotMatch(homePage, /href="#services"[^>]*aria-label="Что забронировать/, "Antalya card must not be a section anchor");
  assert.doesNotMatch(homePage, /href="#collections"[^>]*aria-label="Каппадокия/, "Cappadocia card must not be a section anchor");
});

test("manifesto cards open the matching filtered catalog and expose complete hover galleries", () => {
  const homePage = readFileSync(resolve(projectRoot, "src/app/page.tsx"), "utf8");
  const manifestoCards = readFileSync(resolve(projectRoot, "src/components/home/ManifestoCards.tsx"), "utf8");

  assert.match(homePage, /<ManifestoCards\s*\/>/);
  assert.match(manifestoCards, /href: "\/catalog\?region=aegean"/);
  assert.match(manifestoCards, /href: "\/catalog\?destination=cappadocia"/);
  assert.match(manifestoCards, /setInterval\(/);
  const imagePaths = [...manifestoCards.matchAll(/"(\/images\/[^\"]+)"/g)].map(([, path]) => path);
  assert.ok(imagePaths.length >= 8, "manifesto cards must have full hover galleries");
  assert.equal(new Set(imagePaths).size, imagePaths.length, "manifesto galleries must not repeat image paths");
  assert.match(manifestoCards, /className="manifesto-card-link"/);
});

test("travel guides provide useful free content and clear paid next steps", () => {
  const guidesData = readFileSync(resolve(projectRoot, "src/data/guides.ts"), "utf8");
  const guidePage = readFileSync(resolve(projectRoot, "src/app/guides/[slug]/page.tsx"), "utf8");

  for (const phrase of ["Анталья без суеты", "Стамбул впервые", "Каппадокия без автомобиля"]) {
    assert.ok(guidesData.includes(phrase), `${phrase} must have a guide`);
  }
  assert.match(guidePage, /generateStaticParams/);
  assert.match(guidesData, /Посмотреть услуги|Заказать трансфер/);
  assert.match(guidePage, /guide\.actions\.map/);
  assert.match(guidesData, /href: "\/services\/antalya-airport-transfer"/);
});

test("home service rows navigate to product themes instead of section anchors", () => {
  const homePage = readFileSync(resolve(projectRoot, "src/app/page.tsx"), "utf8");
  const serviceIndexStart = homePage.indexOf('<div className="service-index">');
  const serviceIndexEnd = homePage.indexOf("<Collections />", serviceIndexStart);
  const serviceIndex = homePage.slice(serviceIndexStart, serviceIndexEnd);

  for (const route of [
    "/catalog?q=Босфор&destination=istanbul",
    "/services/antalya-airport-transfer",
    "/catalog?category=excursions&destination=cappadocia",
    "/catalog?category=connectivity",
  ]) {
    assert.ok(homePage.includes(`href: "${route}"`), `${route} must be a working service destination`);
  }
  assert.doesNotMatch(serviceIndex, /href="#collections"/, "service rows must not jump to the collections section");
});

test("airport transfer entry opens the transfer order page", () => {
  const homePage = readFileSync(resolve(projectRoot, "src/app/page.tsx"), "utf8");

  assert.match(homePage, /name: "Трансфер из аэропорта"[\s\S]*?href: "\/services\/antalya-airport-transfer"/);
  assert.match(homePage, /bundle: "Спокойный прилёт"[\s\S]*?href: "\/services\/antalya-airport-transfer"/);
});

test("Antalya collection places its preview between the wave icon and the title", () => {
  const collections = readFileSync(resolve(projectRoot, "src/components/home/Collections.tsx"), "utf8");

  assert.match(collections, /<span className="collection-icon-wrap">[\s\S]*?\{index === 1 && <CollectionThumb/, "Antalya must render its wave icon before the preview and title");
  assert.match(collections, /index !== 3 && index !== 2 && index !== 1/, "the generic trailing preview must skip Antalya");
});

test("marketplace cards disclose pricing and meaningful image alternatives", () => {
  const serviceCard = readFileSync(resolve(projectRoot, "src/components/marketplace/ServiceCard.tsx"), "utf8");
  const destinationCard = readFileSync(resolve(projectRoot, "src/components/marketplace/DestinationCard.tsx"), "utf8");
  const destinationPage = readFileSync(resolve(projectRoot, "src/app/destinations/[slug]/page.tsx"), "utf8");

  assert.match(serviceCard, /Цена/, "service cards must visibly label prices");
  assert.match(serviceCard, /alt=\{service\.title\}/, "service card image alt must name the service");
  assert.match(destinationCard, /alt="Декоративная текстура травертина"/, "destination cards need a truthful image alternative");
  assert.match(destinationPage, /alt="Декоративная текстура травертина"/, "destination detail needs a truthful image alternative");
});

test("affordable homepage items open real product pages with purchase actions", () => {
  const homeData = readFileSync(resolve(projectRoot, "src/data/home.ts"), "utf8");
  const productPage = readFileSync(resolve(projectRoot, "src/app/services/[slug]/page.tsx"), "utf8");
  const actions = readFileSync(resolve(projectRoot, "src/components/marketplace/ProductActions.tsx"), "utf8");

  for (const slug of [
    "pre-trip-checklist",
    "language-cheatsheet",
    "istanbul-walk-map",
    "emergency-contacts",
    "istanbul-audioguide",
    "turkey-ready-route",
    "esim-help",
  ]) {
    assert.ok(homeData.includes(`slug: "${slug}"`), `${slug} must have a product target`);
  }
  assert.match(productPage, /generateStaticParams/, "product pages must be statically exported");
  assert.match(actions, /Добавить в корзину/, "product pages must expose a cart action");
  assert.match(actions, /Купить сейчас/, "product pages must expose a purchase action");
});

test("homepage bundles open the catalog with the matching theme filters", () => {
  const homePage = readFileSync(resolve(projectRoot, "src/app/page.tsx"), "utf8");

  for (const route of [
    "/services/antalya-airport-transfer",
    "/catalog?destination=istanbul",
    "/catalog?destination=antalya&kids=1",
    "/catalog?category=excursions&destination=cappadocia",
  ]) {
    assert.ok(homePage.includes(`href: "${route}"`), `${route} must be a thematic bundle filter`);
  }
  assert.doesNotMatch(homePage, /href="#final-cta"/, "bundles must not jump to the final CTA anchor");
});

test("final CTA starts the journey in the real catalog", () => {
  const homePage = readFileSync(resolve(projectRoot, "src/app/page.tsx"), "utf8");
  const ctaStart = homePage.indexOf('className="final-cta-copy"');
  const ctaEnd = homePage.indexOf('className="newsletter-section"', ctaStart);
  const cta = homePage.slice(ctaStart, ctaEnd);

  assert.match(cta, /<a className="primary-action light-action" href="\/catalog">\s*Начать путешествие/, "final CTA must open the catalog");
  assert.doesNotMatch(cta, /href="#directions"/, "final CTA must not point to a missing homepage anchor");
});

test("direction screens use truthful, screen-specific CTA destinations", () => {
  const homeData = readFileSync(resolve(projectRoot, "src/data/home.ts"), "utf8");
  const directionStory = readFileSync(resolve(projectRoot, "src/components/home/DirectionStory.tsx"), "utf8");

  for (const route of [
    "/catalog?category=excursions",
    "/catalog?category=activities&region=aegean",
    "/catalog?category=excursions&destination=cappadocia",
    "/services/antalya-airport-transfer",
    "/catalog?category=services",
  ]) {
    assert.ok(homeData.includes(`href: "${route}"`), `${route} must match the screen theme`);
  }
  assert.match(directionStory, /href=\{scene\.href\}/, "direction CTA must use the current screen destination");
  assert.doesNotMatch(directionStory, /href="#services"/, "direction screens must not share one generic anchor");
});

test("catalog keeps marketplace quick filters without URL-driven remounts", () => {
  const browser = readFileSync(resolve(projectRoot, "src/components/marketplace/CatalogBrowser.tsx"), "utf8");

  for (const label of ["Сегодня", "Завтра", "До 1 000 ₽"]) {
    assert.match(browser, new RegExp(`label: "${label}"`), `${label} must be available in marketplace quick filters`);
  }
  assert.doesNotMatch(browser, /label: "Начать путешествие"/, "journey CTA must not be presented as a filter");
  assert.doesNotMatch(browser, /key=\{query\}/, "query updates must not remount the catalog browser");
  assert.match(browser, /filterDisclosureOpen/, "mobile filter disclosure must retain its own open state");
  assert.match(browser, /onToggle=/, "mobile filter disclosure must keep its user-controlled state");
});

test("freeze verifier protects the full homepage baseline and exact price label", () => {
  const verifier = readFileSync(resolve(projectRoot, "scripts/verify-marketplace-foundation.mjs"), "utf8");

  assert.match(verifier, /HOMEPAGE_BASE_REF \?\? "4ced717"/, "freeze baseline must match the audited homepage baseline");
  assert.match(verifier, /public\/images/, "homepage image assets must be part of freeze checks");
  assert.match(verifier, /Цена/, "browser verification must assert the exact visible price label");
  assert.match(verifier, /diff-tree", "--no-commit-id", "--name-only", "-r", "-m"/, "freeze verification must remain merge-aware");
});

test("marketplace error content does not nest another main landmark or page title", () => {
  const errorBoundary = readFileSync(resolve(projectRoot, "src/app/marketplace-error.tsx"), "utf8");

  assert.doesNotMatch(errorBoundary, /<main/, "route errors render inside the marketplace shell main");
  assert.doesNotMatch(errorBoundary, /<h1/, "route errors must not duplicate the shell page heading");
  assert.match(errorBoundary, /<section/, "route errors should use a section landmark");
  assert.match(errorBoundary, /<h2/, "route errors should use a subordinate heading");
});

test("destination cards use real detail paths instead of hash-only targets", () => {
  const card = readFileSync(resolve(projectRoot, "src/components/marketplace/DestinationCard.tsx"), "utf8");

  assert.match(card, /href=\{`\/destinations\/\$\{destination\.slug\}`\}/, "destination cards should target their detail route");
  assert.doesNotMatch(card, /href="#/, "destination cards should not add hash-only links");
});
