import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const baseUrl = (process.env.BASE_URL ?? "http://127.0.0.1:3100").replace(/\/$/, "");
const basePath = new URL(baseUrl).pathname.replace(/\/$/, "");
const homepageBaseRef = process.env.HOMEPAGE_BASE_REF ?? "4ced717";
const allowWorkingHomepageChanges = process.env.ALLOW_HOMEPAGE_AUDIT_CHANGES === "1";
const playwrightPath =
  process.env.CODEX_PLAYWRIGHT_PATH ??
  "/Users/anastasiavolkova/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";
const chromePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const frozenHomepagePathspecs = [
  "src/app/page.tsx",
  "src/app/globals.css",
  "src/components/home",
  "src/data/home.ts",
  "public/images",
];

const require = createRequire(import.meta.url);
const typescript = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const output = typescript.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: filename,
  });

  module._compile(output.outputText, filename);
};

const { marketplaceDestinations } = require("../src/data/marketplace.ts");
const destinationNamesByPath = new Map(
  marketplaceDestinations.map(({ name, slug }) => [`/destinations/${slug}`, name]),
);

function runGit(...args) {
  return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
}

function gitLines(...args) {
  const output = runGit(...args);
  return output ? output.split("\n").filter(Boolean).sort() : [];
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
}

function currentHomepageFiles() {
  const files = ["src/app/page.tsx", "src/app/globals.css", "src/data/home.ts"]
    .map((path) => resolve(projectRoot, path))
    .filter(existsSync)
    .concat(
      walkFiles(resolve(projectRoot, "src/components/home")),
      walkFiles(resolve(projectRoot, "public/images")),
    );

  return files.map((path) => relative(projectRoot, path)).sort();
}

function isFrozenHomepagePath(path) {
  return (
    path === "src/app/page.tsx" ||
    path === "src/app/globals.css" ||
    path === "src/data/home.ts" ||
    path.startsWith("src/components/home/") ||
    path.startsWith("public/images/")
  );
}

function verifyHomepageFreeze() {
  runGit("rev-parse", "--verify", homepageBaseRef);

  const baselineFiles = gitLines(
    "ls-tree",
    "-r",
    "--name-only",
    homepageBaseRef,
    "--",
    ...frozenHomepagePathspecs,
  );
  const workingFiles = currentHomepageFiles();
  assert.deepEqual(
    workingFiles,
    baselineFiles,
    `Frozen homepage file list differs from ${homepageBaseRef}`,
  );

  const committedMarketplacePaths = [
    ...new Set(
      gitLines("rev-list", `${homepageBaseRef}..HEAD`).flatMap((commit) =>
        gitLines("diff-tree", "--no-commit-id", "--name-only", "-r", "-m", commit),
      ),
    ),
  ].sort();
  const forbiddenCommittedPaths = committedMarketplacePaths.filter(isFrozenHomepagePath);
  assert.deepEqual(
    forbiddenCommittedPaths,
    [],
    `Marketplace commits must not modify frozen homepage paths: ${forbiddenCommittedPaths.join(", ")}`,
  );

  const workingHomepagePaths = gitLines(
    "diff",
    "--name-only",
    homepageBaseRef,
    "--",
    ...frozenHomepagePathspecs,
  );
  if (!allowWorkingHomepageChanges) {
    assert.deepEqual(
      workingHomepagePaths,
      [],
      `Working tree must not modify frozen homepage paths: ${workingHomepagePaths.join(", ")}`,
    );
  }
}

function collectBrowserErrors(page) {
  const errors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push({ source: "console", text: message.text(), url: message.location().url });
    }
  });
  page.on("pageerror", (error) => errors.push({ source: "pageerror", text: error.message }));

  return errors;
}

function unexpectedBrowserErrors(errors) {
  return errors.filter((error) => {
    try {
      return new URL(error.url).pathname !== "/favicon.ico";
    } catch {
      return true;
    }
  });
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 1, `${label} has ${overflow}px of horizontal overflow`);
}

async function openMarketplacePage(context, path, expectedHeading, label = path) {
  const page = await context.newPage();
  const errors = collectBrowserErrors(page);
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });

  assert.equal(response?.status(), 200, `${label} must return HTTP 200`);
  assert.equal(await page.getByRole("banner").count(), 1, `${label} must render the marketplace header`);
  assert.equal(
    (await page.getByRole("heading", { level: 1 }).textContent())?.replace(/\s+/g, " ").trim(),
    expectedHeading,
    `${label} must render through the marketplace shell`,
  );
  await assertNoHorizontalOverflow(page, label);

  return { errors, page };
}

async function assertCleanPage(page, errors, label) {
  await page.waitForTimeout(100);
  await assertNoHorizontalOverflow(page, label);
  assert.deepEqual(unexpectedBrowserErrors(errors), [], `${label} emitted browser errors`);
}

async function destinationPaths(page) {
  const paths = await page.locator('a[href*="/destinations/"]').evaluateAll((links, rootPath) =>
    [...new Set(links.map((link) => {
      const href = link.getAttribute("href") ?? "";
      return href.startsWith(rootPath) ? href.slice(rootPath.length) || "/" : href;
    }).filter((href) => href.startsWith("/destinations/") && href !== "/destinations/"))],
    basePath,
  );

  assert.ok(paths.length >= 5, "Destination index must link to every generated destination detail page");
  return paths;
}

async function verifyCatalogQueries(context) {
  const { page, errors } = await openMarketplacePage(
    context,
    "/catalog",
    "Соберите поездку в Турцию",
  );

  try {
    assert.ok(await page.locator("article").count() > 0, "Catalog must render service cards");
    assert.match(
      await page.locator("article strong").first().textContent(),
      /Цена/,
      "Catalog cards must expose the visible price label",
    );
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("maxPrice") === "1000"),
      page.getByRole("button", { name: "До 1 000 ₽" }).click(),
    ]);
    assert.equal(
      await page.getByRole("button", { name: "До 1 000 ₽" }).getAttribute("aria-pressed"),
      "true",
      "Quick filters must update their selected state",
    );
    assert.ok(await page.locator("article").count() > 0, "Price quick filter must retain matching catalog cards");

    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("sort") === "price-asc"),
      page.getByLabel("Сортировка").selectOption("price-asc"),
    ]);

    assert.match(page.url(), /maxPrice=1000/, "Marketplace quick filters must synchronize the URL");
  } finally {
    await assertCleanPage(page, errors, "/catalog query states");
    await page.close();
  }

  const { page: searchPage, errors: searchErrors } = await openMarketplacePage(
    context,
    "/search?q=%D0%9A%D0%B0%D0%BF%D0%BF%D0%B0%D0%B4%D0%BE%D0%BA%D0%B8%D1%8F",
    "Поиск по каталогу",
    "/search query state",
  );
  try {
    await searchPage.getByText("Здесь можно искать по названию, городу или фильтрам.").waitFor();
    assert.ok(await searchPage.locator("article").count() > 0, "Search query must render matching cards");
  } finally {
    await assertCleanPage(searchPage, searchErrors, "/search query state");
    await searchPage.close();
  }
}

async function verifyUnknownDestination(context) {
  const page = await context.newPage();
  const errors = collectBrowserErrors(page);
  try {
    const response = await page.goto(`${baseUrl}/destinations/not-a-real-place`, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 404, "Unknown destinations must return HTTP 404");
    assert.match(
      (await page.locator("body").innerText()).toLowerCase(),
      /404|not found|не найден/,
      "Unknown destinations must render not-found content",
    );
  } finally {
    const expectedNotFoundUrl = `${baseUrl}/destinations/not-a-real-place`;
    await assertCleanPage(
      page,
      errors.filter((error) => error.url !== expectedNotFoundUrl),
      "unknown destination route",
    );
    await page.close();
  }
}

async function verifyViewport(width, height, includeEveryDestination) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });

  try {
    await verifyCatalogQueries(context);

    const { page: destinationsPage, errors: destinationsErrors } = await openMarketplacePage(
      context,
      "/destinations",
      "Направления по Турции",
      `${width}px /destinations`,
    );
    let paths;
    try {
      paths = await destinationPaths(destinationsPage);
    } finally {
      await assertCleanPage(destinationsPage, destinationsErrors, `${width}px /destinations`);
      await destinationsPage.close();
    }

    const pathsToCheck = includeEveryDestination ? paths : paths.slice(0, 1);
    for (const path of pathsToCheck) {
      const destinationName = destinationNamesByPath.get(path.replace(/\/$/, ""));
      assert.ok(destinationName, `${path} must correspond to marketplace destination data`);

      const { page, errors } = await openMarketplacePage(
        context,
        path,
        "Направления по Турции",
        `${width}px ${path}`,
      );
      try {
        const destinationHeading = page.getByRole("heading", { level: 2, name: destinationName, exact: true });
        assert.equal(await destinationHeading.count(), 1, `${path} must have a destination title`);
        assert.equal(
          (await destinationHeading.innerText()).replace(/\s+/g, " ").trim(),
          destinationName,
          `${path} must render its expected destination title`,
        );

        const serviceHrefs = await page.locator("article a[href]").evaluateAll((links, rootPath) =>
          links.map((link) => {
            const href = link.getAttribute("href") ?? "";
            return href.startsWith(rootPath) ? href.slice(rootPath.length) || "/" : href;
          }).filter(Boolean),
          basePath,
        );
        if (serviceHrefs.length > 0) {
          assert.ok(
            serviceHrefs.every((href) => href.startsWith("/services/")),
            `${path} service links must use /services/ paths: ${serviceHrefs.join(", ")}`,
          );
        }
      } finally {
        await assertCleanPage(page, errors, `${width}px ${path}`);
        await page.close();
      }
    }

    await verifyUnknownDestination(context);
  } finally {
    await context.close();
  }
}

verifyHomepageFreeze();

const { chromium } = await import(playwrightPath);
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--no-proxy-server"],
});

try {
  await verifyViewport(1440, 900, true);
  await verifyViewport(390, 844, false);
  console.log("Marketplace foundation verification passed at 1440px and 390px.");
} finally {
  await browser.close();
}
