# Footer payment badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show official SBP and Mir payment badges in the Turkey Planners marketplace footer.

**Architecture:** Keep the badges as local static SVG files in `frontend/public/payment/`; render them from the existing `MarketplaceFooter` component with descriptive alternative text. CSS extends only the footer layout and stacks cleanly on the existing mobile breakpoint.

**Tech Stack:** Next.js, React, CSS modules, Node assertion test.

## Global Constraints

- Reuse the existing project-local official SVG artwork; do not load a third-party runtime asset.
- The badges are informational only and must not change checkout or payment-provider behavior.
- Keep visible copy in Russian and preserve the current responsive footer.
- Deploy the committed `main` revision through the established GitHub Actions workflow, then prune only unused Docker build cache and dangling images on Turkey.

---

### Task 1: Footer payment badges

**Files:**

- Create: `frontend/public/payment/sbp-logo.svg`
- Create: `frontend/public/payment/mir-logo.svg`
- Modify: `frontend/src/components/marketplace/MarketplaceFooter.tsx`
- Modify: `frontend/src/components/marketplace/marketplace.module.css`
- Test: `frontend/scripts/legalDocuments.test.mjs`

**Interfaces:**

- Consumes: `MarketplaceFooter` and its CSS-module class names.
- Produces: a labelled payment-method section with two local SVG images at `/payment/sbp-logo.svg` and `/payment/mir-logo.svg`.

- [ ] **Step 1: Add failing footer-contract assertions**

```js
assert.match(marketplaceFooter, /Оплата онлайн/);
assert.match(marketplaceFooter, /payment\/sbp-logo\.svg/);
assert.match(marketplaceFooter, /payment\/mir-logo\.svg/);
assert.ok(existsSync(resolve(process.cwd(), "public/payment/sbp-logo.svg")));
assert.ok(existsSync(resolve(process.cwd(), "public/payment/mir-logo.svg")));
```

- [ ] **Step 2: Run the focused test and confirm it fails before implementation**

Run: `npm run test:legal`

Expected: failure because the footer and assets do not yet mention payment badges.

- [ ] **Step 3: Add the two SVG assets and render the labelled footer section**

```tsx
<section aria-label="Способы оплаты" className={styles.footerPayments}>
  <p>Оплата онлайн</p>
  <div className={styles.paymentBadges}>
    <img
      alt="Система быстрых платежей"
      src={sitePath("/payment/sbp-logo.svg")}
    />
    <img alt="Платёжная система Мир" src={sitePath("/payment/mir-logo.svg")} />
  </div>
</section>
```

- [ ] **Step 4: Add scoped responsive styling**

```css
.footerPayments {
  display: grid;
  gap: 0.65rem;
}
.paymentBadges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
```

Constrain the SBP icon by height and the Mir icon by width so both are legible,
visually balanced, and do not stretch the footer grid.

- [ ] **Step 5: Verify and commit**

Run: `npm run test:legal && npm run lint && npm run typecheck && npm run build`

Expected: all commands exit `0`; production build preserves the marketplace
routes.

Commit:

```bash
git add frontend/public/payment frontend/src/components/marketplace/MarketplaceFooter.tsx frontend/src/components/marketplace/marketplace.module.css frontend/scripts/legalDocuments.test.mjs docs/superpowers/plans/2026-08-11-footer-payment-badges.md
git commit -m "feat(frontend): show payment badges in footer"
```

### Task 2: Production deployment and cleanup

**Files:** No repository changes.

**Interfaces:**

- Consumes: pushed `main` revision and the restricted Turkey deployment workflow.
- Produces: healthy production containers, an HTTP-200 storefront footer with both badges, and reclaimed build-cache space.

- [ ] **Step 1: Push and wait for `Deploy Turkey Planners`**

Run: `git push origin main && gh run watch <run-id> --repo TorentoFlag/turkey --exit-status`

Expected: completed successful deployment.

- [ ] **Step 2: Verify the public footer in a browser**

Open `https://turkeyplanners.com/`, inspect the footer and assert that both
image resources load from `/payment/sbp-logo.svg` and `/payment/mir-logo.svg`.

- [ ] **Step 3: Clean only rebuildable Docker data on Turkey**

Run on Turkey:

```bash
docker image prune -f
docker builder prune -af
```

Expected: no running containers, named volumes, MinIO media, PostgreSQL data,
or `/opt/turkiye/backups` files are removed. Record disk usage before and after.
