# Floema-Fidelity Homepage Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing Russian Turkey homepage with Floema-level WebGL media, GSAP scroll choreography, structural rhythm, mobile direction, and graceful fallbacks while creating no additional product routes or application architecture.

**Architecture:** The complete readable homepage remains server-rendered semantic React. Two client-only Three.js canvases render the hero collage and five-act direction media; GSAP/ScrollTrigger owns scroll-linked timelines; Lenis supplies smooth scroll from one central lifecycle. All remaining sections use focused DOM components with GSAP timelines and CSS fallbacks.

**Tech Stack:** Next.js 16.2.10, React 19.2.4, TypeScript 5, GSAP 3.13+, ScrollTrigger, Three.js, Lenis, Sharp, CSS Modules/global design tokens, local licensed media, Playwright verification script.

## Global Constraints

- Scope is the Russian-language homepage only.
- Do not create catalogue, category, service-detail, checkout, account, FAQ, CMS, backend, payment, or internal-page architecture.
- Do not copy Floema branding, text, photography, illustrations, product assets, source code, or legal data.
- Preserve Turkey-focused content and original local photography.
- Canvas must remain decorative and `aria-hidden`; all readable content and controls stay in semantic DOM.
- Without JavaScript or WebGL, every section remains visible and usable in normal document flow.
- With `prefers-reduced-motion`, Lenis is disabled and long desktop pins are removed.
- Cap canvas DPR at 1.5 desktop and 1.25 mobile.
- Test responsive widths at 390, 430, 768, 1024, and 1440 px.
- No horizontal overflow, forced section-by-section wheel navigation, forced scroll snapping, scroll lock, bounce, or elastic scene motion. Lenis `smoothWheel: true` remains enabled for reference-level smoothing.
- Prototype prices remain explicitly marked as demonstration data.
- Use local assets and keep source attribution in `public/images/CREDITS.md`.

## Official Technical References

- GSAP installation and plugin registration: https://gsap.com/docs/v3/Installation/
- ScrollTrigger pin and scrub behaviour: https://gsap.com/docs/v3/Plugins/ScrollTrigger/
- Three.js npm and ES-module setup: https://threejs.org/manual/en/installation.html
- Lenis installation and GSAP synchronisation: https://github.com/darkroomengineering/lenis

## File Map

### Existing files to modify

- `package.json`: dependencies and verification commands.
- `package-lock.json`: exact dependency resolution.
- `src/app/page.tsx`: semantic homepage order and focused section components.
- `src/app/globals.css`: global tokens, section geometry, fallback states, and responsive rules.
- `src/data/home.ts`: typed hero fragments, direction scenes, service kits, and collection descriptors.
- `src/components/home/Header.tsx`: Floema-density pill navigation while preserving menu accessibility.
- `src/components/home/Newsletter.tsx`: preserve honest prototype state inside new closing layout.
- `scripts/verify-home.mjs`: structure, motion readiness, fallback, responsive, and interaction assertions.
- `public/images/CREDITS.md`: new source and generated-asset records.

### Existing files to replace or retire

- `src/components/home/DirectionStory.tsx`: replace IntersectionObserver slideshow with `DirectionCanvasStory`.
- `src/components/home/Collections.tsx`: replace hover preview with scroll-linked `CollectionsStage`.
- `src/components/home/RevealObserver.tsx`: retire after every reveal migrates to scoped GSAP timelines and no-JS defaults.

### New focused files

- `src/components/home/motion/gsap.ts`: one GSAP/ScrollTrigger registration point.
- `src/components/home/motion/MotionProvider.tsx`: Lenis lifecycle, reduced-motion state, and refresh coordination.
- `src/components/home/motion/types.ts`: shared canvas and texture interfaces.
- `src/components/home/motion/createHeroScene.ts`: Three.js hero renderer.
- `src/components/home/motion/createDirectionScene.ts`: Three.js direction renderer and texture cache.
- `src/components/home/HeroCanvasScene.tsx`: hero DOM/canvas composition and fallback.
- `src/components/home/DirectionCanvasStory.tsx`: pinned desktop story and flowing mobile story.
- `src/components/home/ManifestoSequence.tsx`: manifesto text and editorial card timeline.
- `src/components/home/FeaturedServicesStage.tsx`: two isolated service-kit compositions.
- `src/components/home/CollectionsStage.tsx`: sticky desktop collections and mobile rows.
- `src/components/home/StatementScene.tsx`: dark team statement and media reveal.
- `src/components/home/PrinciplesSequence.tsx`: process stagger and closing line.
- `src/components/home/HomeClosing.tsx`: final statement, newsletter, footer, and original line artwork.
- `src/hooks/useMediaQuery.ts`: reactive breakpoint and reduced-motion query.
- `src/lib/homeMotion.ts`: pure progress and scene-index helpers.
- `scripts/prepare-home-assets.mjs`: deterministic WebP/AVIF derivatives.
- `public/images/home-kits/arrival-kit-source.png`: transparent source artwork.
- `public/images/home-kits/bosphorus-kit-source.png`: transparent source artwork.
- `public/images/home-kits/arrival-kit.webp`: optimised transparent asset.
- `public/images/home-kits/bosphorus-kit.webp`: optimised transparent asset.
- `public/images/home-canvas/*.webp`: optimised hero and direction textures.

---

### Task 1: Capture the Existing Homepage Baseline and Install Motion Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/verify-home.mjs`
- Commit existing baseline: `src/**`, `public/**`, root configuration files, existing plans and project documents

**Interfaces:**
- Produces installed modules `gsap`, `three`, `lenis`, `sharp`, and `@types/three`.
- Produces a baseline browser test that later tasks extend.

- [ ] **Step 1: Commit the approved Phase 4 baseline without build artifacts**

```bash
git add .gitignore AGENTS.md DESIGN_DIRECTION.md PROJECT.md Plans.md TASK.md \
  eslint.config.mjs next.config.ts package.json package-lock.json tsconfig.json \
  src public scripts docs/superpowers/plans/2026-07-20-home-page-design.md
git commit -m "feat: capture approved editorial homepage baseline"
```

Expected: the existing homepage becomes a stable rollback point; `.next`, `node_modules`, and synced `sources/` are not committed.

- [ ] **Step 2: Add a failing motion-readiness assertion**

Add after `page.goto(baseUrl, { waitUntil: "networkidle" })` in `scripts/verify-home.mjs`:

```js
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
```

- [ ] **Step 3: Run the browser check and confirm the new assertion fails**

Run with the current local server:

```bash
BASE_URL=http://127.0.0.1:3101 npm run verify:home
```

Expected: FAIL because `[data-motion-provider]` and `canvas[data-hero-canvas]` do not exist.

- [ ] **Step 4: Install exact dependency families**

```bash
npm install gsap@^3.13.0 three lenis sharp
npm install --save-dev @types/three
```

Expected: `package.json` and `package-lock.json` contain the five packages; no alternative animation framework is added.

- [ ] **Step 5: Verify the dependency graph and base project**

```bash
npm ls gsap three lenis sharp @types/three
npm run lint
npm run typecheck
npm run build
```

Expected: dependency tree resolves once; lint, typecheck, and production build pass before motion code begins.

- [ ] **Step 6: Commit dependency setup and failing specification**

```bash
git add package.json package-lock.json scripts/verify-home.mjs
git commit -m "test: define enhanced homepage motion contract"
```

---

### Task 2: Build the Central Motion Lifecycle and Pure Progress Helpers

**Files:**
- Create: `src/components/home/motion/gsap.ts`
- Create: `src/components/home/motion/MotionProvider.tsx`
- Create: `src/hooks/useMediaQuery.ts`
- Create: `src/lib/homeMotion.ts`
- Modify: `src/app/page.tsx`
- Modify: `scripts/verify-home.mjs`

**Interfaces:**
- Produces `MotionProvider(): React.JSX.Element` and document state `html[data-motion="full|reduced"]`.
- Produces `clamp01(value: number): number`, `sceneIndexAt(progress: number, count: number): number`, and `sceneBlendAt(progress: number, count: number): { index: number; nextIndex: number; blend: number }`.
- Later tasks import `gsap` and `ScrollTrigger` only from `@/components/home/motion/gsap`.

- [ ] **Step 1: Extend the browser test for full and reduced motion**

Add one normal-motion context and keep the existing reduced-motion context:

```js
const motionState = await page.locator("html").getAttribute("data-motion");
assert.equal(motionState, "reduced");
assert.equal(await page.locator("[data-motion-provider]").count(), 1);
```

In a second context with `reducedMotion: "no-preference"` assert:

```js
assert.equal(await motionPage.locator("html").getAttribute("data-motion"), "full");
```

- [ ] **Step 2: Run the check and verify the data-state assertion fails**

```bash
BASE_URL=http://127.0.0.1:3101 npm run verify:home
```

Expected: FAIL because `data-motion` is absent.

- [ ] **Step 3: Add the shared GSAP registration module**

Create `src/components/home/motion/gsap.ts`:

```ts
"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };
```

- [ ] **Step 4: Add deterministic pure progress helpers**

Create `src/lib/homeMotion.ts`:

```ts
export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function sceneIndexAt(progress: number, count: number) {
  if (count < 1) return 0;
  return Math.min(count - 1, Math.floor(clamp01(progress) * count));
}

export function sceneBlendAt(progress: number, count: number) {
  const scaled = clamp01(progress) * count;
  const index = Math.min(count - 1, Math.floor(scaled));
  return {
    index,
    nextIndex: Math.min(count - 1, index + 1),
    blend: index === count - 1 ? 0 : scaled - index,
  };
}
```

- [ ] **Step 5: Implement the Lenis/GSAP lifecycle**

Create `MotionProvider.tsx` with this lifecycle:

```tsx
"use client";

import Lenis from "lenis";
import { useEffect } from "react";

import { gsap, ScrollTrigger } from "./gsap";

export function MotionProvider() {
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const saveData = Boolean(connection?.saveData);
    document.documentElement.dataset.motion = reduced ? "reduced" : "full";
    document.documentElement.dataset.saveData = saveData ? "true" : "false";
    if (reduced) return () => {
      delete document.documentElement.dataset.motion;
      delete document.documentElement.dataset.saveData;
    };

    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    const update = (time: number) => lenis.raf(time * 1000);
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);

    const refresh = () => ScrollTrigger.refresh();
    document.fonts.ready.then(refresh);

    return () => {
      gsap.ticker.remove(update);
      lenis.destroy();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
      delete document.documentElement.dataset.motion;
      delete document.documentElement.dataset.saveData;
    };
  }, []);

  return <span data-motion-provider hidden />;
}
```

Render `<MotionProvider />` once beside `<Header />` in `src/app/page.tsx`.

- [ ] **Step 6: Add `useMediaQuery` for mobile and fallback branches**

```ts
"use client";

import { useEffect, useState } from "react";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState<boolean | null>(null);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}
```

Canvas components initialise enhanced desktop rendering only when the hook returns `false`. While it returns `null`, they keep the server-rendered fallback visible, preventing mobile from briefly creating a desktop renderer before hydration.

- [ ] **Step 7: Verify and commit the lifecycle**

```bash
npm run lint
npm run typecheck
npm run build
BASE_URL=http://127.0.0.1:3101 npm run verify:home
git add src/app/page.tsx src/components/home/motion src/hooks/useMediaQuery.ts \
  src/lib/homeMotion.ts scripts/verify-home.mjs
git commit -m "feat: add central smooth-scroll motion lifecycle"
```

Expected: the motion-provider assertions pass; the hero canvas assertion remains the next intentional failure.

---

### Task 3: Prepare Canvas Textures and Two Exhibited Service Kits

**Files:**
- Create: `scripts/prepare-home-assets.mjs`
- Create: `public/images/home-kits/arrival-kit-source.png`
- Create: `public/images/home-kits/bosphorus-kit-source.png`
- Create: `public/images/home-kits/arrival-kit.webp`
- Create: `public/images/home-kits/bosphorus-kit.webp`
- Create: `public/images/home-sources/bodrum-amanruya.avif`
- Create: `public/images/home-sources/cappadocia-cave-hotel.avif`
- Create: `public/images/home-sources/istanbul-legacy-hotel.avif`
- Create: `public/images/home-canvas/*.webp`
- Modify: `public/images/CREDITS.md`
- Modify: `src/data/home.ts`

**Interfaces:**
- Produces `HeroFragment`, `ServiceKit`, and expanded `DirectionScene` descriptors.
- Canvas files consume only paths produced in `heroFragments` and direction `canvasImage` fields.

- [ ] **Step 1: Add asset-presence checks to the verification script**

```js
for (const asset of [
  "public/images/home-kits/arrival-kit.webp",
  "public/images/home-kits/bosphorus-kit.webp",
]) {
  await access(new URL(`../${asset}`, import.meta.url));
}
```

Import `access` from `node:fs/promises`. Expected initial result: FAIL with `ENOENT`.

- [ ] **Step 2: Create the two transparent source assets using the image generation tool**

Generate `arrival-kit-source.png` with this exact art direction:

```text
Transparent-background premium editorial still life for a Turkish travel service: a matte charcoal modern car key fob, a restrained terracotta airport transfer card with abstract route lines and no airline branding, and a minimal cream eSIM sleeve. Orthographic three-quarter view, museum product photography, natural soft shadow isolated on transparency, no luggage, no airplane, no palm trees, no readable brand names, no people, no gradient background.
```

Generate `bosphorus-kit-source.png` with this exact art direction:

```text
Transparent-background premium editorial still life for Istanbul travel: a folded off-white Bosphorus route sheet with thin black and terracotta lines, a compact ferry ticket, and a small dark metal transit token. Museum product photography, precise paper texture, soft isolated shadow, no airline iconography, no people, no tourist clichés, no readable third-party branding, transparent background.
```

Inspect both outputs before accepting them. Regenerate if transparency, legibility, or art direction fails.

- [ ] **Step 3: Import the three approved hotel photographs**

Copy only the three downloaded Pexels source files supplied in the task context to:

```text
public/images/home-sources/bodrum-amanruya.avif
public/images/home-sources/cappadocia-cave-hotel.avif
public/images/home-sources/istanbul-legacy-hotel.avif
```

They are Pexels photographs `20297239` by Çisel Bozar, `29158010` by Ahmet, and `29080197` by Ömer Derinyar. Do not import related or recommended images from those pages.

- [ ] **Step 4: Create a deterministic Sharp derivative script**

Create `scripts/prepare-home-assets.mjs`:

```js
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputs = path.join(root, "public/images/home-canvas");
await mkdir(outputs, { recursive: true });

const canvasSources = [
  "istanbul-fog.jpg",
  "perge-ruins.jpg",
  "kas-coast.jpg",
  "cappadocia-dawn.jpg",
  "istanbul-modern.jpg",
  "ankara-alley.jpg",
  "spice-bazaar.jpg",
  "bosphorus-ferry.jpg",
  "aegean-bodrum.jpg",
  "travertine-texture.jpg",
];

const hotelSources = [
  "bodrum-amanruya.avif",
  "cappadocia-cave-hotel.avif",
  "istanbul-legacy-hotel.avif",
];

for (const file of canvasSources) {
  await sharp(path.join(root, "public/images", file))
    .resize({ width: 1800, height: 1200, fit: "cover", withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(path.join(outputs, file.replace(/\.jpg$/, ".webp")));
}

for (const file of hotelSources) {
  await sharp(path.join(root, "public/images/home-sources", file))
    .resize({ width: 1800, height: 1200, fit: "cover", withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(path.join(outputs, file.replace(/\.avif$/, ".webp")));
}

for (const name of ["arrival-kit", "bosphorus-kit"]) {
  await sharp(path.join(root, `public/images/home-kits/${name}-source.png`))
    .resize({ width: 1800, withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100, effort: 5 })
    .toFile(path.join(root, `public/images/home-kits/${name}.webp`));
}
```

Add `"prepare:home-assets": "node scripts/prepare-home-assets.mjs"` to `package.json`.

- [ ] **Step 5: Extend homepage data with exact typed descriptors**

Add types and exports:

```ts
export type HeroFragment = {
  image: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  crop: [number, number];
};

export type ServiceKit = {
  id: "arrival" | "bosphorus";
  eyebrow: string;
  title: string;
  place: string;
  price: string;
  image: string;
  alt: string;
};

export type DirectionContextPanel = {
  eyebrow: string;
  title: string;
  detail: string;
};

export type DirectionScene = {
  number: string;
  label: string;
  title: string;
  description: string;
  cta: string;
  image: string;
  imageAlt: string;
  focalPoint: string;
  canvasImage: string;
  contextPanel: DirectionContextPanel | null;
};

export const serviceKits: ServiceKit[] = [
  {
    id: "arrival",
    eyebrow: "Сразу после прилёта",
    title: "Спокойный старт",
    place: "Трансфер · eSIM · поддержка",
    price: "от 4 490 ₽*",
    image: "/images/home-kits/arrival-kit.webp",
    alt: "Набор для прибытия: ключ, трансферная карта и упаковка eSIM",
  },
  {
    id: "bosphorus",
    eyebrow: "Один день в городе",
    title: "Босфор в своём ритме",
    place: "Маршрут · паром · аудиогид",
    price: "от 1 290 ₽*",
    image: "/images/home-kits/bosphorus-kit.webp",
    alt: "Карта маршрута по Босфору, билет на паром и жетон",
  },
];

export const heroFragments: HeroFragment[] = [
  { image: "/images/home-canvas/istanbul-fog.webp", x: 0.04, y: 0.12, width: 0.15, depth: 0.25, crop: [0.48, 0.5] },
  { image: "/images/home-canvas/perge-ruins.webp", x: 0.28, y: 0.06, width: 0.08, depth: 0.8, crop: [0.44, 0.52] },
  { image: "/images/home-canvas/kas-coast.webp", x: 0.48, y: 0.11, width: 0.09, depth: 0.62, crop: [0.56, 0.58] },
  { image: "/images/home-canvas/cappadocia-dawn.webp", x: 0.69, y: 0.17, width: 0.08, depth: 0.45, crop: [0.5, 0.46] },
  { image: "/images/home-canvas/istanbul-modern.webp", x: 0.87, y: 0.1, width: 0.13, depth: 0.72, crop: [0.55, 0.5] },
  { image: "/images/home-canvas/ankara-alley.webp", x: 0.12, y: 0.39, width: 0.08, depth: 0.66, crop: [0.5, 0.58] },
  { image: "/images/home-canvas/spice-bazaar.webp", x: 0.34, y: 0.32, width: 0.07, depth: 0.36, crop: [0.49, 0.46] },
  { image: "/images/home-canvas/bosphorus-ferry.webp", x: 0.58, y: 0.36, width: 0.08, depth: 0.82, crop: [0.58, 0.52] },
  { image: "/images/home-canvas/aegean-bodrum.webp", x: 0.78, y: 0.35, width: 0.12, depth: 0.3, crop: [0.5, 0.55] },
  { image: "/images/home-canvas/travertine-texture.webp", x: 0.21, y: 0.61, width: 0.11, depth: 0.48, crop: [0.46, 0.5] },
  { image: "/images/home-canvas/cappadocia-dawn.webp", x: 0.44, y: 0.68, width: 0.06, depth: 0.9, crop: [0.62, 0.52] },
  { image: "/images/home-canvas/istanbul-fog.webp", x: 0.63, y: 0.59, width: 0.07, depth: 0.55, crop: [0.38, 0.5] },
  { image: "/images/home-canvas/kas-coast.webp", x: 0.88, y: 0.65, width: 0.1, depth: 0.76, crop: [0.4, 0.62] },
  { image: "/images/home-canvas/perge-ruins.webp", x: 0.08, y: 0.79, width: 0.09, depth: 0.38, crop: [0.6, 0.48] },
  { image: "/images/home-canvas/spice-bazaar.webp", x: 0.38, y: 0.84, width: 0.1, depth: 0.7, crop: [0.54, 0.4] },
  { image: "/images/home-canvas/aegean-bodrum.webp", x: 0.72, y: 0.81, width: 0.09, depth: 0.5, crop: [0.6, 0.5] },
];
```

Append these three fragments so each hotel occupies a different depth band and starts outside the central title safe area:

```ts
{ image: "/images/home-canvas/bodrum-amanruya.webp", x: 0.04, y: 0.48, width: 0.16, depth: 0.92, crop: [0.48, 0.56] },
{ image: "/images/home-canvas/cappadocia-cave-hotel.webp", x: 0.81, y: 0.52, width: 0.11, depth: 0.58, crop: [0.5, 0.52] },
{ image: "/images/home-canvas/istanbul-legacy-hotel.webp", x: 0.52, y: 0.92, width: 0.07, depth: 0.24, crop: [0.52, 0.5] },
```

Add these exact direction enhancements to the five existing scene objects:

```ts
const directionEnhancements = [
  {
    canvasImage: "/images/home-canvas/perge-ruins.webp",
    contextPanel: { eyebrow: "Кураторский выбор", title: "48 исторических маршрутов", detail: "От античных городов до утреннего Стамбула" },
  },
  { canvasImage: "/images/home-canvas/kas-coast.webp", contextPanel: null },
  { canvasImage: "/images/home-canvas/cappadocia-dawn.webp", contextPanel: null },
  { canvasImage: "/images/home-canvas/istanbul-modern.webp", contextPanel: null },
  {
    canvasImage: "/images/home-canvas/ankara-alley.webp",
    contextPanel: { eyebrow: "Уже на месте", title: "Поддержка путешественника", detail: "Связь, перевод и помощь в одном контакте" },
  },
] satisfies Pick<DirectionScene, "canvasImage" | "contextPanel">[];
```

- [ ] **Step 6: Produce and inspect derivatives**

```bash
npm run prepare:home-assets
file public/images/home-kits/*.webp public/images/home-canvas/*.webp
du -h public/images/home-kits/*.webp public/images/home-canvas/*.webp
```

Expected: every file is WebP; no individual full-frame texture exceeds 700 KB; transparency remains in both kits.

- [ ] **Step 7: Record provenance and commit assets**

Append generated-asset prompts, creation date, and statement “project-specific generated source, no third-party brand assets” to `CREDITS.md`. Add the three Pexels page URLs and authors from Step 3.

```bash
git add package.json package-lock.json scripts/prepare-home-assets.mjs src/data/home.ts \
  public/images/home-kits public/images/home-sources public/images/home-canvas \
  public/images/CREDITS.md scripts/verify-home.mjs
git commit -m "feat: add original canvas textures and service-kit art"
```

---

### Task 4: Build the Reference-Precise Streaming Hero and Connected-Pill Header

**Files:**
- Create: `src/components/home/motion/types.ts`
- Create: `src/components/home/motion/createHeroScene.ts`
- Create: `src/components/home/HeroCanvasScene.tsx`
- Create: `src/components/home/ConnectedPillNav.tsx`
- Modify: `src/components/home/Header.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `scripts/verify-home.mjs`

**Interfaces:**
- Produces `CanvasController` and `HeroSceneController`.
- `createHeroScene(canvas, fragments, options)` returns `{ setScrollVelocity, resize, destroy }`.
- `HeroCanvasScene` receives `{ fragments: HeroFragment[]; fallbackImage: string }`.
- `ConnectedPillNav` receives the existing homepage links and renders one decorative SVG shape behind semantic anchors.

- [ ] **Step 1: Expand the failing hero contract**

```js
assert.equal(await page.locator("#hero h1").count(), 1);
assert.equal(
  (await page.locator("#hero h1").textContent())?.replace(/\s+/g, " ").trim(),
  "Всё необходимое — от первого трансфера до лучших впечатлений",
);
assert.equal(await page.locator("#hero a").count(), 0, "Hero remains a pure editorial statement");
assert.equal(await page.locator("canvas[data-hero-canvas]").getAttribute("aria-hidden"), "true");
assert.equal(await page.locator("[data-hero-fallback]").count(), 1);
assert.equal(await page.locator(".desktop-nav").getAttribute("data-pill-nav"), "true");
assert.equal(await page.locator("[data-pill-shape]").count(), 1);
```

In full motion, assert the canvas bounding box is at least 95% viewport height. Record one fragment state, wait 700 ms at `scrollY === 0`, and assert its wrapped stream position changed. In reduced motion, assert fallback image opacity is `1` and canvas is hidden.

- [ ] **Step 2: Define the canvas controller interfaces**

```ts
export type CanvasController = {
  resize(): void;
  destroy(): void;
};

export type HeroSceneController = CanvasController & {
  setScrollVelocity(velocity: number): void;
};

export type DirectionSceneController = CanvasController & {
  setScene(index: number, nextIndex: number, blend: number): void;
};

export type RendererOptions = {
  maxDpr: number;
  onFailure(): void;
};
```

- [ ] **Step 3: Implement `createHeroScene`**

Use `THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" })`, an orthographic camera, one shared plane geometry, and one material per fragment. Convert normalised fragment positions into viewport units on resize. Seed all positions from `HeroFragment` data so hydration never randomises the layout. In the render loop compute:

```ts
const depthSpeed = 0.055 + depth * 0.115;
const velocityLift = Math.min(0.12, Math.abs(scrollVelocity) * 0.00008);
state.y += deltaSeconds * (depthSpeed + velocityLift);
if (state.y > 1.18) state.y -= 2.36;
mesh.position.y = viewportHeight * (state.y - 0.5);
mesh.position.x = viewportWidth * (state.x - 0.5) + Math.sin(elapsed * 0.22 + state.phase) * state.drift;
mesh.scale.setScalar(0.58 + depth * 0.92);
material.opacity = 0.16 + depth * 0.84;
```

Expose the current normalised y values on the canvas as `data-stream-sample` no more often than every 250 ms for deterministic verification. The render loop runs only while the hero intersects the viewport and the document is visible. Catch renderer or texture errors, call `onFailure`, and destroy geometry, materials, textures, renderer, observers, and listeners on cleanup.

Pass `maxDpr: 1` when `html[data-save-data="true"]`; otherwise pass 1.25 at widths ≤760 and 1.5 above 760.

- [ ] **Step 4: Implement the React scene and scroll timeline**

`HeroCanvasScene.tsx` must render only the decorative media, fallback, and central statement:

```tsx
<section className="hero-canvas-scene" id="hero" data-header-tone="dark">
  <canvas aria-hidden="true" data-hero-canvas ref={canvasRef} />
  <Image alt="" aria-hidden="true" data-hero-fallback fill priority src={fallbackImage} />
  <div className="hero-canvas-copy">
    <h1>Всё необходимое — от первого трансфера<br />до лучших впечатлений</h1>
  </div>
</section>
```

Create one scoped GSAP context. ScrollTrigger uses `trigger: section`, `start: "top top"`, `end: "+=100%"`, `pin: true`, `pinSpacing: false`, and `scrub: 0.8`; `onUpdate` passes `self.getVelocity()` to the controller. The next section must rise over the pinned hero and crop the statement naturally. Reduced motion removes pinning.

- [ ] **Step 5: Implement the measured connected-pill header**

`ConnectedPillNav.tsx` measures the semantic anchors with one `ResizeObserver`, builds rounded SVG segment paths behind them, and rebuilds only when sizes change. Resting anchor gap is `6px`; each segment uses `12px` radius and `10px 20px` padding. Pointer entry sets the active visual index; the hovered segment gains `20px` side margin over `500ms cubic-bezier(.175,.885,.32,1.275)`, then returns over `300ms cubic-bezier(.19,1,.22,1)`. The SVG includes bridges between adjacent pills, a clipped 30px radial glow following pointer coordinates, and a 4px dark active dot. Links remain normal focusable anchors above the decorative `aria-hidden` SVG. Coarse pointers and reduced motion keep the resting shape without expansion.

- [ ] **Step 6: Add final and fallback CSS states**

Required state selectors:

```css
.hero-canvas-scene { position: relative; z-index: 0; min-height: 100svh; overflow: clip; background: #f2efea; }
[data-hero-canvas], [data-hero-fallback] { position: absolute; inset: 0; width: 100%; height: 100%; }
.hero-canvas-copy { position: relative; z-index: 2; min-height: 100svh; display: grid; place-items: center; text-align: center; pointer-events: none; }
.hero-canvas-copy h1 { max-width: 13em; font-size: clamp(3.3rem, 4vw, 5rem); line-height: 1.05; letter-spacing: -0.04em; }
html[data-motion="full"] [data-hero-fallback] { opacity: 0; }
html[data-webgl="failed"] [data-hero-canvas], html[data-motion="reduced"] [data-hero-canvas] { display: none; }
html[data-webgl="failed"] [data-hero-fallback], html[data-motion="reduced"] [data-hero-fallback] { opacity: 1; }
```

- [ ] **Step 7: Verify hero and header against reference keyframes**

```bash
npm run lint
npm run typecheck
npm run build
BASE_URL=http://127.0.0.1:3101 npm run verify:home
```

Browser checkpoints: 1440 × 900 at rest, after 1.4 seconds, at `scrollY = 50% viewport`, and with pointer over every desktop pill; 390 × 844 at rest and after 1.4 seconds. Confirm image depth reads as foreground/middle/distant layers, title stays fixed and readable, fragments may pass visually behind text but never intercept controls, the next section covers the pinned hero, and hover expansion never shifts utilities outside the viewport.

- [ ] **Step 8: Commit hero and connected header**

```bash
git add src/app/page.tsx src/app/globals.css src/components/home/HeroCanvasScene.tsx \
  src/components/home/ConnectedPillNav.tsx src/components/home/Header.tsx \
  src/components/home/motion/createHeroScene.ts src/components/home/motion/types.ts scripts/verify-home.mjs
git commit -m "feat: match streaming hero and connected header motion"
```

---

### Task 5: Replace the Direction Slideshow with One Scrubbed Five-Act Canvas Story

**Files:**
- Create: `src/components/home/motion/createDirectionScene.ts`
- Create: `src/components/home/DirectionCanvasStory.tsx`
- Delete: `src/components/home/DirectionStory.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `scripts/verify-home.mjs`

**Interfaces:**
- Produces `DirectionSceneController` with `setScene(index, nextIndex, blend)`, `resize()`, and `destroy()`.
- Consumes `sceneBlendAt` and `DirectionScene.canvasImage`.
- Emits `data-active-scene="0..4"` only when the logical index changes.

- [ ] **Step 1: Write the failing story-behaviour assertions**

For 1440 full motion:

```js
const story = page.locator("#directions");
assert.ok((await story.evaluate((el) => el.getBoundingClientRect().height)) >= 8 * 900);
assert.equal(await story.locator("canvas[data-direction-canvas]").count(), 1);
await page.evaluate(() => {
  const section = document.querySelector("#directions");
  scrollTo(0, section.offsetTop + section.offsetHeight * 0.52);
});
await page.waitForTimeout(450);
assert.equal(await story.getAttribute("data-active-scene"), "2");
```

For reduced motion and widths ≤760, assert there are five visible `[data-direction-act]` articles and no pinned canvas.

- [ ] **Step 2: Implement the direction texture controller**

`createDirectionScene.ts` must use two full-viewport planes sharing one shader material with uniforms `uTextureA`, `uTextureB`, `uBlend`, `uCropA`, and `uCropB`. Fragment shader blend:

```glsl
vec2 uvA = (vUv - 0.5) * uCropA.zw + uCropA.xy;
vec2 uvB = (vUv - 0.5) * uCropB.zw + uCropB.xy;
float veil = smoothstep(0.0, 1.0, uBlend);
vec4 a = texture2D(uTextureA, uvA);
vec4 b = texture2D(uTextureB, uvB);
gl_FragColor = mix(a, b, veil);
```

Load low-resolution preview textures first. Promote only previous/current/next scenes to full texture. On `setScene`, update uniforms without creating new geometry or renderers.

Render only while the directions section intersects the viewport and the document is visible. On `visibilitychange`, stop rendering when hidden and render one fresh frame when visible again.

- [ ] **Step 3: Implement desktop markup and GSAP timeline**

Render one `direction-pin` containing canvas, shade, header-safe area, metadata line, five overlaid copies, progress, and contextual panels for acts 01 and 05. The outer section height is `900svh`.

Create one ScrollTrigger:

```ts
ScrollTrigger.create({
  trigger: root,
  start: "top top",
  end: "bottom bottom",
  scrub: 0.8,
  pin: pin,
  anticipatePin: 1,
  onUpdate: ({ progress }) => {
    const state = sceneBlendAt(progress, scenes.length);
    controller.setScene(state.index, state.nextIndex, state.blend);
    setActiveIndex((current) => current === state.index ? current : state.index);
  },
});
```

Use `gsap.set`/`gsap.to` only when the logical scene changes for DOM copy; do not trigger React state on every frame.

- [ ] **Step 4: Implement mobile and reduced-motion branches**

At widths ≤760 or reduced motion, render five semantic articles in document flow. Each article has a 100svh image frame, number/label rule, headline, body, CTA, and its contextual panel. Do not initialise Three.js or long pins in this branch.

- [ ] **Step 5: Replace imports and remove old slideshow CSS**

Replace `<DirectionStory scenes={directionScenes} />` with `<DirectionCanvasStory scenes={directionScenes} />`. Remove `.direction-media-layer`, negative `margin-top`, and old IntersectionObserver state rules. Keep mobile image focal-point support.

- [ ] **Step 6: Verify all five acts in both directions**

Browser checkpoints at progress 0.02, 0.22, 0.42, 0.62, and 0.82 at 1440 × 900. Repeat acts 01, 03, and 05 after reverse scrolling. At 390 × 844 verify every act is readable without overlap.

```bash
npm run lint
npm run typecheck
npm run build
BASE_URL=http://127.0.0.1:3101 npm run verify:home
```

- [ ] **Step 7: Commit the five-act story**

```bash
git add src/app/page.tsx src/app/globals.css src/components/home/DirectionCanvasStory.tsx \
  src/components/home/motion/createDirectionScene.ts scripts/verify-home.mjs
git rm src/components/home/DirectionStory.tsx
git commit -m "feat: add scrubbed five-act Turkey story"
```

---

### Task 6: Rebuild Manifesto and Featured Services as Floema-Paced Editorial Stages

**Files:**
- Create: `src/components/home/ManifestoSequence.tsx`
- Create: `src/components/home/FeaturedServicesStage.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `scripts/verify-home.mjs`

**Interfaces:**
- `ManifestoSequence` accepts no state and owns a scoped timeline.
- `FeaturedServicesStage` consumes `serviceKits: ServiceKit[]` and `affordableItems`.
- It preserves `#services`, `#bundles`, and `#affordable` anchor targets inside one Floema-paced commercial stage.

- [ ] **Step 1: Add failing structural assertions**

```js
assert.equal(await page.locator("#manifesto [data-manifesto-line]").count(), 4);
assert.equal(await page.locator("#services [data-service-kit]").count(), 2);
assert.equal(await page.locator("#services .service-index").count(), 0);
assert.equal(await page.locator("#affordable [data-affordable-item]").count(), 7);
assert.equal(await page.locator("#bundles").count(), 1);
```

- [ ] **Step 2: Implement four-line manifesto markup**

Use these exact lines:

```tsx
const lines = [
  "Турция не помещается",
  "в одну поездку.",
  "Поэтому всё необходимое",
  "должно быть в одном месте.",
];
```

Render an editorial card using `/images/spice-bazaar.jpg`, caption “Стамбул · маршрут на три дня”, and the existing short description. GSAP maps section progress to each line’s colour from `rgba(31,33,28,.15)` to the primary ink, then moves the card from upper-left negative space to lower-right.

- [ ] **Step 3: Implement the two exhibited service kits**

Render each `ServiceKit` as one large stage with image, accent label, title, metadata, price, and action. The first kit is horizontal at desktop; the second is narrow and vertical. Use a scoped timeline that scales the image from 0.92 to 1 while its copy enters from 24 px below.

Wrap the first multi-service kit with `id="bundles"`. After both kits, render a compact `id="affordable"` rail from the seven existing `affordableItems`; every item receives `data-affordable-item`, keeps its demonstration price, and uses a minimum 44 px action height. This rail is part of the same commercial stage rather than a new card-grid section.

- [ ] **Step 4: Remove the old ideas/service index duplication**

Keep one editorial story inside the manifesto and remove the separate three-card ideas composition. Preserve `#ideas` as an anchor alias on the manifesto card wrapper so existing navigation still resolves.

- [ ] **Step 5: Verify rhythm and demo-price disclosure**

Assert both kit prices and every affordable price end with `*` or sit beside one shared visible note saying prices are demonstration data. Confirm the first affordable price contains `50 ₽`. Check screenshots at manifesto 20%/70%, both service stages, and the affordable rail at 1440 and 390.

- [ ] **Step 6: Verify and commit**

```bash
npm run lint
npm run typecheck
npm run build
BASE_URL=http://127.0.0.1:3101 npm run verify:home
git add src/app/page.tsx src/app/globals.css src/components/home/ManifestoSequence.tsx \
  src/components/home/FeaturedServicesStage.tsx scripts/verify-home.mjs
git commit -m "feat: rebuild manifesto and featured service stages"
```

---

### Task 7: Build the Sticky Oversized Collections Composition

**Files:**
- Create: `src/components/home/CollectionsStage.tsx`
- Delete: `src/components/home/Collections.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `scripts/verify-home.mjs`

**Interfaces:**
- Consumes `collectionItems`.
- Exposes five buttons with `aria-pressed`, `data-collection-index`, and one logical active index.
- Desktop ScrollTrigger updates active index; focus/click updates the same visual state.

- [ ] **Step 1: Add failing collection assertions**

```js
assert.equal(await page.locator("#collections [data-collection-index]").count(), 5);
assert.equal(await page.locator("#collections [aria-pressed='true']").count(), 1);
assert.ok((await page.locator("#collections").evaluate((el) => el.offsetHeight)) >= 1800);
```

- [ ] **Step 2: Implement desktop sticky typography**

Render five grid rows containing icon, name, count, and an embedded image. Use `clamp(3.4rem, 6vw, 7rem)` names. The sticky frame is 100svh inside a 240svh container. Scroll progress moves the complete row stack from `12vh` to `-58vh`; each row image counter-translates by 10–18vh for depth.

- [ ] **Step 3: Preserve keyboard and touch parity**

Each row remains a button. `onFocus`, `onPointerEnter`, and `onClick` call one `activate(index)` function. Active state changes text colour, image opacity, and z-index. No information is available only on hover.

- [ ] **Step 4: Implement mobile embedded rows**

At widths ≤760, remove sticky positioning and render five 85–100svh rows. Every row has its own image between the name and count. Active state follows focus/click but is not required to reveal the image.

- [ ] **Step 5: Verify and commit**

Check desktop scroll at first, middle, and last rows; tab through every collection; click row 04 and assert “Эгейское море” is active. Check all five mobile rows.

```bash
npm run lint
npm run typecheck
npm run build
BASE_URL=http://127.0.0.1:3101 npm run verify:home
git add src/app/page.tsx src/app/globals.css src/components/home/CollectionsStage.tsx scripts/verify-home.mjs
git rm src/components/home/Collections.tsx
git commit -m "feat: add oversized sticky collections stage"
```

---

### Task 8: Rebuild Statement, Principles, Closing, Newsletter, and Graphic Footer

**Files:**
- Create: `src/components/home/StatementScene.tsx`
- Create: `src/components/home/PrinciplesSequence.tsx`
- Create: `src/components/home/HomeClosing.tsx`
- Modify: `src/components/home/Newsletter.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `scripts/verify-home.mjs`

**Interfaces:**
- `StatementScene`, `PrinciplesSequence`, and `HomeClosing` own scoped timelines and accept no cross-section state.
- `HomeClosing` receives `brandName: string` and renders newsletter plus homepage footer.

- [ ] **Step 1: Add failing lower-page contract assertions**

```js
assert.equal(await page.locator("#statement [data-statement-media]").count(), 1);
assert.equal(await page.locator("#principles li").count(), 3);
assert.equal(await page.locator("#home-closing #newsletter").count(), 1);
assert.equal(await page.locator("#home-closing #page-footer").count(), 1);
assert.equal(await page.locator("#page-footer svg[data-footer-art]").count(), 1);
```

- [ ] **Step 2: Implement the honest team statement scene**

Use the existing statement copy and attribution. Layout: dark-green 12-column grid, copy in columns 1–6, `/images/galata-night.jpg` in columns 8–12. Animate media clip-path from `inset(12% 0 18% 18%)` to `inset(0)` and stagger copy by 80 ms.

- [ ] **Step 3: Implement the principles baseline composition**

Use existing three principle texts. Desktop positions: item 01 at 18vh, item 02 at 25vh, item 03 at 32vh. The closing line “Просто выбрать. Понятно забронировать. Легко путешествовать.” settles at the lower-left. Mobile removes those offsets and stacks naturally.

- [ ] **Step 4: Implement one integrated closing section**

Replace the final full-bleed photograph with:

```tsx
<section id="home-closing">
  <div className="closing-statement">
    <p>От первого сообщения до последнего парома</p>
    <h2>Турция начинается здесь</h2>
  </div>
  <section id="newsletter" aria-labelledby="newsletter-title">
    <h2 id="newsletter-title">Идеи для следующей поездки</h2>
    <Newsletter />
  </section>
  <footer id="page-footer">
    <svg aria-hidden="true" data-footer-art viewBox="0 0 1440 640">
      <path d="M80 470H1360M260 470V260M1180 470V260M260 320C470 160 970 160 1180 320" />
      <path d="M520 470L570 390H860L920 470M610 390V340H800V390" />
      <path d="M1040 470V250M1010 250H1150V320H1040" />
      <path d="M80 535C280 500 430 565 650 530S1030 500 1360 545" />
    </svg>
    <nav aria-label="Навигация в подвале">
      <div><a href="#directions">Направления</a><a href="#collections">Коллекции</a></div>
      <div><a href="#services">Услуги</a><a href="#statement">О подходе</a></div>
      <div><a href="#principles">Как это работает</a><a href="#newsletter">Подписка</a></div>
    </nav>
  </footer>
</section>
```

Move the existing `Newsletter` into this component. Keep the prototype status message and data-processing disclaimer unchanged.

- [ ] **Step 5: Add original footer line artwork**

Create one inline SVG with `data-footer-art`, `viewBox="0 0 1440 640"`, and original line drawings: a Bosphorus ferry profile, a simplified bridge span, a street-sign post, and a stepped shoreline. Use only paths, lines, and rectangles authored for this project. Animate stroke dash-offset once as the footer enters; render the completed lines immediately for reduced motion.

- [ ] **Step 6: Verify and commit lower-page ending**

Check statement, principle baselines, newsletter validation, footer artwork, footer links, and contrast at 1440 and 390.

```bash
npm run lint
npm run typecheck
npm run build
BASE_URL=http://127.0.0.1:3101 npm run verify:home
git add src/app/page.tsx src/app/globals.css src/components/home/StatementScene.tsx \
  src/components/home/PrinciplesSequence.tsx src/components/home/HomeClosing.tsx \
  src/components/home/Newsletter.tsx scripts/verify-home.mjs
git commit -m "feat: complete Floema-paced homepage ending"
```

---

### Task 9: Complete Header Tone States, Remove Retired Motion Code, and Harden Fallbacks

**Files:**
- Modify: `src/components/home/Header.tsx`
- Delete: `src/components/home/RevealObserver.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `scripts/verify-home.mjs`

**Interfaces:**
- Header tone reads `html[data-header-tone]` set by scoped section timelines.
- No global reveal observer remains.

- [ ] **Step 1: Add failing header/fallback checks**

```js
assert.equal(await page.locator(".desktop-nav").getAttribute("data-pill-nav"), "true");
assert.equal(await page.locator("[data-pill-shape]").count(), 1);
assert.equal(await page.locator("[data-reveal]").count(), 0);
```

Add an optional query `?forceWebglFailure=1`; assert hero fallback and direction DOM media remain visible.

- [ ] **Step 2: Verify the Task 4 connected-pill geometry across tones**

Keep the six homepage links and the measured SVG pill surface from Task 4. For `dark`, `light`, and `fluor` header tones, preserve the same geometry while transitioning path fill and logo/utility contrast over 350 ms. Header height remains 72–86 px desktop and 64–72 px mobile. Do not reduce tap targets below 44 px or move search/locale/menu utilities during tone changes.

- [ ] **Step 3: Drive tone from section timelines**

Each section timeline sets `document.documentElement.dataset.headerTone` at logical scene changes. Keep a lightweight IntersectionObserver fallback only inside Header for no-GSAP mode; do not recreate a global reveal observer.

- [ ] **Step 4: Remove retired reveal code and prove no-JS visibility**

Delete `RevealObserver.tsx`, remove every `data-reveal`, `data-visible`, and `data-reveal-ready` selector. With JavaScript disabled, assert all section headings have non-zero bounding boxes and computed opacity `1`.

- [ ] **Step 5: Verify modal accessibility did not regress**

At 390: open menu, tab through first/last control, press Escape, and assert focus returns to “Открыть меню”. At 1440: open search, close it, and assert focus returns to “Поиск”.

- [ ] **Step 6: Verify and commit cleanup**

```bash
npm run lint
npm run typecheck
npm run build
BASE_URL=http://127.0.0.1:3101 npm run verify:home
git add src/app/page.tsx src/app/globals.css src/components/home/Header.tsx scripts/verify-home.mjs
git rm src/components/home/RevealObserver.tsx
git commit -m "refactor: centralise homepage motion and fallbacks"
```

---

### Task 10: Production Performance, Responsive QA, and Final Floema Keyframe Review

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/home/Header.tsx`
- Modify: `src/components/home/HeroCanvasScene.tsx`
- Modify: `src/components/home/DirectionCanvasStory.tsx`
- Modify: `src/components/home/ManifestoSequence.tsx`
- Modify: `src/components/home/FeaturedServicesStage.tsx`
- Modify: `src/components/home/CollectionsStage.tsx`
- Modify: `src/components/home/StatementScene.tsx`
- Modify: `src/components/home/PrinciplesSequence.tsx`
- Modify: `src/components/home/HomeClosing.tsx`
- Modify: `scripts/verify-home.mjs`
- Modify: `docs/superpowers/specs/2026-07-20-floema-fidelity-home-refinement-design.md` only if an approved implementation constraint changes

**Interfaces:**
- Produces the final static `/` route and verified fallback behaviour.

- [ ] **Step 1: Add the complete responsive test matrix**

For each width 390, 430, 768, 1024, and 1440 assert:

```js
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
assert.ok(overflow <= 1, `Horizontal overflow: ${overflow}px`);
assert.deepEqual(errors, []);
```

Add slow forward scroll, fast jump to 80%, reverse scroll to 20%, direct `#collections`, resize 1440→768→390, and visibility-change refresh checks.

- [ ] **Step 2: Verify canvas resource constraints**

Expose development-only diagnostics on each canvas as `data-dpr` and `data-resident-textures`. Assert DPR ≤1.5 desktop, ≤1.25 mobile, and direction resident high-resolution textures ≤3.

- [ ] **Step 3: Run the full technical gate**

```bash
npm run lint
npm run typecheck
npm run build
BASE_URL=http://127.0.0.1:3101 npm run verify:home
```

Expected: all pass; build output contains only `/` and `/_not-found`.

- [ ] **Step 4: Perform desktop keyframe comparison**

At 1440 × 900 capture and compare:

1. hero at 0%, 45%, and 90%;
2. direction acts 01–05 at their settled points and two transition midpoints;
3. manifesto at 25% and 75%;
4. both service kits;
5. collections first, middle, and last positions;
6. statement reveal midpoint;
7. principles and closing;
8. footer top and bottom.

For each screenshot answer: composition strong, typography large enough, negative space intentional, media dominant, transition unique, no template pattern, header contrast correct. Fix every negative answer before continuing.

- [ ] **Step 5: Perform mobile keyframe comparison**

At 390 × 844 capture hero, all five direction acts, manifesto, both kits, collections 01/03/05, statement, principles, newsletter, and footer. Verify that no desktop overlap or pin survives unintentionally.

- [ ] **Step 6: Test degradation modes**

- JavaScript disabled: all copy and links visible.
- WebGL forced failure: fallback media visible, no blank scene.
- Reduced motion: no Lenis, long pins, clip animations, or negative scene offsets.
- Save Data emulation: DPR 1 and deferred non-critical textures.
- Keyboard-only: menu, search, collections, CTA links, and newsletter usable.

- [ ] **Step 7: Final build and commit**

```bash
npm run lint
npm run typecheck
npm run build
BASE_URL=http://127.0.0.1:3101 npm run verify:home
git add src scripts docs public package.json package-lock.json
git commit -m "feat: finish Floema-fidelity Turkey homepage"
git status --short
```

Expected: verification passes and status is clean except explicitly preserved unrelated user files.

## Spec Coverage Map

- Adaptive header: Task 9.
- Hero canvas and WebGL fallback: Task 4.
- Five-act scrubbed direction story: Task 5.
- Manifesto and editorial media: Task 6.
- Featured services, bundles anchor, and affordable offers: Task 6.
- Oversized sticky collections: Task 7.
- Statement scene: Task 8.
- Principles: Task 8.
- Closing, newsletter, and graphic footer: Task 8.
- Central motion and data flow: Task 2.
- Graceful degradation for no-JS, reduced motion, WebGL failure, and Save Data: Tasks 2, 4, 5, 9, and 10.
- Performance constraints: Tasks 3, 4, 5, and 10.
- Accessibility and interaction parity: Tasks 5, 7, 8, 9, and 10.
- Desktop/mobile visual comparison and final iteration: Task 10.

## Final Delivery Checklist

- [ ] Only the homepage route was changed.
- [ ] Hero and direction story use enhanced canvas media with DOM fallbacks.
- [ ] Five direction acts scrub smoothly forward and backward.
- [ ] Manifesto, service kits, collections, statement, principles, and closing follow the approved structural mapping.
- [ ] Header remains accessible and changes tone with scenes.
- [ ] Mobile has independent flowing composition.
- [ ] Reduced motion, no-JS, WebGL failure, and save-data modes remain readable.
- [ ] All images have meaningful alt text or are explicitly decorative.
- [ ] Credits include all external and generated media provenance.
- [ ] Lint, typecheck, production build, and browser verification pass.
- [ ] Visual review at 1440 × 900 and 390 × 844 has no unresolved negative answer.
