# Direction Scene Side-Reveal Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each direction scene assemble from the side with a staggered sequence matching the supplied Floema reference.

**Architecture:** Keep `DirectionStory` responsible for scene selection and add one GSAP timeline effect keyed to `activeIndex`. Mark the five content parts explicitly in JSX, then use CSS only for motion-safe defaults and reduced-motion visibility. The existing sticky image stage and IntersectionObserver selection remain unchanged.

**Tech Stack:** Next.js 16, React 19, TypeScript, GSAP, CSS transitions/media queries, Playwright verification script.

## Global Constraints

- Apply the behavior to the five scenes rendered by `DirectionStory`.
- Keep the existing sticky media stage, scene selection, layout variants, and responsive structure.
- Do not add routes or change copy, imagery, or navigation.
- Preserve `prefers-reduced-motion: reduce` behavior.
- Animate only `transform`, `opacity`, and non-layout visual properties.
- Do not introduce horizontal overflow or break focus states.

---

### Task 1: Add explicit scene animation parts and direction state

**Files:**
- Modify: `src/components/home/DirectionStory.tsx`
- Test: `scripts/verify-home.mjs`

**Interfaces:**
- Consumes: existing `activeIndex` and `scenes` state.
- Produces: each `.direction-copy` exposes `[data-direction-part="meta|badge|title|description|cta"]` descendants for the GSAP timeline.

- [ ] **Step 1: Add explicit part attributes in JSX**

Wrap or annotate the existing metadata, badge, heading, description, and link with `data-direction-part` values. Keep the rendered text and element types unchanged.

- [ ] **Step 2: Add a focused motion assertion**

Extend the full-motion Playwright check to assert that the active scene has one each of `meta`, `badge`, `title`, `description`, and `cta`, while reduced-motion keeps the active copy visible.

- [ ] **Step 3: Run the focused verification**

Run `npm run verify:home` against the local server. Expected: the current suite passes and the new selectors are found.

### Task 2: Implement the keyed GSAP entrance timeline

**Files:**
- Modify: `src/components/home/DirectionStory.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `[data-direction-part]` elements from Task 1 and `activeIndex`.
- Produces: one cancellable GSAP timeline per active-scene change, with right-entry for forward navigation and left-entry for backward navigation.

- [ ] **Step 1: Track previous scene index and reduced-motion state**

Use a ref initialized to `-1` for the previous index and a media query for `(prefers-reduced-motion: reduce)`. Skip transform animation when reduced motion is enabled.

- [ ] **Step 2: Create the active-scene timeline**

Use a `useLayoutEffect` keyed by `activeIndex`. Resolve the active `.direction-copy` and its five parts, derive `direction = activeIndex >= previousIndex ? 1 : -1`, and build:

```ts
const fromX = direction > 0 ? 72 : -72;
const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
timeline
  .fromTo(parts.meta, { x: fromX, y: 10, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.42 }, 0)
  .fromTo(parts.badge, { x: fromX * 0.72, y: 8, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.48 }, "-=0.28")
  .fromTo(parts.title, { x: fromX * 0.52, y: 18, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.72 }, "-=0.28")
  .fromTo(parts.description, { x: fromX * 0.34, y: 12, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.52 }, "-=0.42")
  .fromTo(parts.cta, { x: fromX * 0.22, y: 8, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.45 }, "-=0.26");
```

Use `gsap.context`/cleanup so a new activation kills the prior timeline. Keep the initial scene entering from the right.

- [ ] **Step 3: Add motion-safe CSS defaults**

When full motion is ready, keep direction parts visible by default and let GSAP set the transient hidden values. Under reduced motion, explicitly disable transitions/transforms and set all parts to `opacity: 1; transform: none`.

- [ ] **Step 4: Verify direction changes**

Run `npm run verify:home` and manually scroll the `#directions` section down and up. Expected: no layout shift, no horizontal overflow, and only the newly active scene animates.

### Task 3: Visual and regression verification

**Files:**
- Modify: none unless verification exposes a regression.
- Test: `scripts/verify-home.mjs`

**Interfaces:**
- Consumes: the finished scene animation.
- Produces: verified full-motion and reduced-motion behavior at 390px, 430px, 768px, 1024px, and 1440px.

- [ ] **Step 1: Run the full homepage verification**

Run `npm run verify:home` with the Webpack dev server available at the configured base URL. Expected: `Homepage verification passed from 390px to 1440px.`

- [ ] **Step 2: Check the working tree**

Run `git diff --check` and `git status --short`. Expected: no whitespace errors, only the intended source/style/test changes.

- [ ] **Step 3: Record the result**

If all checks pass, report the updated files, the local URL, and any remaining browser-only visual caveat without changing the approved scope.
