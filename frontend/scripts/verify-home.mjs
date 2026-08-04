import assert from "node:assert/strict";
import { access } from "node:fs/promises";

for (const asset of [
  "public/images/home-kits/arrival-kit.webp",
  "public/images/home-kits/bosphorus-kit.webp",
]) {
  await access(new URL(`../${asset}`, import.meta.url));
}

const playwrightPath =
  process.env.CODEX_PLAYWRIGHT_PATH ??
  "/Users/anastasiavolkova/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs";
const chromePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3100";

const { chromium } = await import(playwrightPath);
const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--no-proxy-server"],
});

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
  return errors.filter((error) => error.url !== `${baseUrl}/favicon.ico`);
}

async function verifyViewport(width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = collectBrowserErrors(page);

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => document.documentElement.dataset.motion === "reduced",
  );

  assert.equal(
    await page.locator("html").getAttribute("data-motion"),
    "reduced",
    "The homepage must expose reduced motion state",
  );
  assert.equal(
    await page.locator("[data-motion-provider]").count(),
    1,
    "The homepage must expose one motion lifecycle",
  );
  assert.equal(
    await page.locator("canvas[data-hero-canvas]").count(),
    1,
    "The enhanced hero must expose its canvas",
  );
  assert.equal(await page.locator("#hero h1").count(), 1);
  assert.equal(
    (await page.locator("#hero h1").textContent())?.replace(/\s+/g, " ").trim(),
    "Турция, собранная под ваш маршрут",
  );
  assert.equal(
    await page.locator("#hero a").count(),
    0,
    "Hero remains a pure editorial statement",
  );
  assert.equal(
    await page.locator("canvas[data-hero-canvas]").getAttribute("aria-hidden"),
    "true",
  );
  assert.equal(await page.locator("[data-hero-fallback]").count(), 1);
  assert.equal(await page.locator(".desktop-nav").getAttribute("data-pill-nav"), "true");
  assert.equal(
    await page.locator("[data-pill-shape]").count(),
    width > 1100 ? 1 : 0,
    "The connected shape renders only while desktop navigation is visible",
  );

  const reducedCanvas = page.locator("canvas[data-hero-canvas]");
  const reducedFallback = page.locator("[data-hero-fallback]");
  assert.equal(await reducedCanvas.evaluate((element) => getComputedStyle(element).display), "none");
  assert.equal(Number(await reducedFallback.evaluate((element) => getComputedStyle(element).opacity)), 1);

  await page.keyboard.press("Tab");
  assert.equal(await page.locator(":focus").textContent(), "Перейти к содержанию");
  assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);

  assert.equal(await page.locator("[data-direction-scene]").count(), 5);

  for (const id of [
    "hero",
    "directions",
    "manifesto",
    "ideas",
    "services",
    "collections",
    "affordable",
    "bundles",
    "statement",
    "principles",
    "final-cta",
    "newsletter",
    "page-footer",
  ]) {
    assert.equal(await page.locator(`#${id}`).count(), 1, `Missing section #${id}`);
  }

  for (const id of [
    "directions",
    "manifesto",
    "ideas",
    "services",
    "collections",
    "affordable",
    "bundles",
    "statement",
    "principles",
    "final-cta",
    "newsletter",
  ]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(160);
  }
  await page.locator("#hero").scrollIntoViewIfNeeded();

  const imageState = await page.locator("main img").evaluateAll((images) =>
    images.map((image) => ({ complete: image.complete, width: image.naturalWidth })),
  );
  assert.ok(imageState.length >= 10, "Expected at least ten editorial photographs");
  const brokenImages = await page.locator("main img").evaluateAll((images) =>
    images.filter((image) => image.currentSrc && image.complete && image.naturalWidth === 0).length,
  );
  assert.equal(brokenImages, 0, "No requested editorial photograph may be broken");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 1, `Horizontal overflow at ${width}px: ${overflow}px`);
  assert.deepEqual(unexpectedBrowserErrors(errors), [], `Browser errors at ${width}px`);

  if (width <= 430) {
    const menu = page.getByRole("button", { name: "Открыть меню" });
    assert.equal(await menu.count(), 1);
    await menu.click();
    assert.equal(await page.locator("[data-mobile-menu]").getAttribute("data-open"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("[data-mobile-menu]").getAttribute("data-open"), "false");
    assert.equal(await page.locator(":focus").getAttribute("aria-label"), "Открыть меню");
  }

  if (width === 1440) {
    const search = page.getByRole("button", { name: "Поиск", exact: true }).first();
    await search.click();
    assert.equal(await page.getByRole("dialog").getAttribute("aria-modal"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(":focus").getAttribute("aria-label"), "Поиск");

    await page.locator("#newsletter").scrollIntoViewIfNeeded();
    await page.getByLabel("Ваш email").fill("reader@example.com");
    await page.getByRole("button", { name: "Подписаться" }).click();
    assert.match(
      await page.locator("#newsletter-status").textContent(),
      /Спасибо/,
    );
  }

  await context.close();
}

async function verifyFullMotionLifecycle() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const motionPage = await context.newPage();
  const errors = collectBrowserErrors(motionPage);

  await motionPage.goto(baseUrl, { waitUntil: "networkidle" });
  await motionPage.waitForFunction(
    () => document.documentElement.dataset.motion === "full",
  );
  await motionPage.waitForFunction(
    () => document.documentElement.dataset.motionReady === "true",
  );
  assert.equal(
    await motionPage.locator("html").getAttribute("data-motion"),
    "full",
    "The homepage must expose full motion state",
  );
  assert.equal(
    await motionPage.locator("html").getAttribute("data-motion-ready"),
    "true",
    "The homepage must signal readiness only after smooth motion initializes",
  );

  const heroCanvas = motionPage.locator("canvas[data-hero-canvas]");
  const activeDirection = motionPage.locator('[data-direction-scene][data-active="true"]');
  for (const part of ["meta", "badge", "title", "description", "cta"]) {
    assert.equal(
      await activeDirection.locator(`[data-direction-part="${part}"]`).count(),
      1,
      `Active direction scene must expose one ${part} animation part`,
    );
  }
  await motionPage.waitForFunction(
    () => Boolean(document.querySelector("canvas[data-hero-canvas]")?.getAttribute("data-stream-sample")),
  );
  const canvasBox = await heroCanvas.boundingBox();
  assert.ok(canvasBox && canvasBox.height >= 855, "Hero canvas must fill at least 95% of the viewport");
  assert.equal(await motionPage.evaluate(() => scrollY), 0);
  const firstSample = await heroCanvas.getAttribute("data-stream-sample");
  await motionPage.waitForTimeout(700);
  const secondSample = await heroCanvas.getAttribute("data-stream-sample");
  assert.notEqual(firstSample, secondSample, "Hero stream must move autonomously at rest");

  await motionPage.locator('[data-direction-scene][data-index="0"]').scrollIntoViewIfNeeded();
  await motionPage.waitForTimeout(180);
  assert.equal(
    await motionPage.locator("#directions").getAttribute("data-direction-animation"),
    "active",
    "The first direction scene animation must start when the section enters the viewport",
  );

  await motionPage.emulateMedia({ reducedMotion: "reduce" });
  await motionPage.waitForFunction(
    () => document.documentElement.dataset.motion === "reduced",
  );
  assert.equal(
    await motionPage.locator("html").getAttribute("data-motion-ready"),
    null,
    "Reduced motion must tear down smooth-motion readiness",
  );

  await motionPage.emulateMedia({ reducedMotion: "no-preference" });
  await motionPage.waitForFunction(
    () => document.documentElement.dataset.motionReady === "true",
  );
  assert.deepEqual(
    unexpectedBrowserErrors(errors),
    [],
    "Full-motion lifecycle must not emit browser errors",
  );

  await context.close();
}

try {
  await verifyFullMotionLifecycle();
  await verifyViewport(1440, 900);
  await verifyViewport(1024, 768);
  await verifyViewport(768, 900);
  await verifyViewport(430, 880);
  await verifyViewport(390, 844);
  console.log("Homepage verification passed from 390px to 1440px.");
} finally {
  await browser.close();
}
