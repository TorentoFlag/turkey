# Legal documents and company details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the supplied User Agreement, Privacy Policy and SMART DEVELOPMENT AND TOURISM COMPANY LIMITED details in the public Turkey Planners frontend.

**Architecture:** `frontend/src/config/site.ts` owns repeated operator facts; `frontend/src/config/legal.ts` owns typed supplied-copy blocks. Server-rendered legal routes use a presentation component inside the existing `MarketplaceShell`; both footers read shared configuration and link to canonical legal routes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS modules, Node built-in test runner.

## Global Constraints

- Preserve supplied Russian copy and company facts without shortening, rewriting, dates or new legal claims.
- Canonical routes: `/legal/terms`, `/legal/privacy`; `/privacy` aliases the Privacy Policy.
- Do not change checkout, payment, account, API, backend, database or product rules.
- Reuse current responsive visual language; add no dependencies, secrets or customer data.

---

### Task 1: Centralise company details and supplied legal copy

**Files:**

- Modify: `frontend/src/types/site.ts`
- Modify: `frontend/src/config/site.ts`
- Create: `frontend/src/config/legal.ts`
- Create: `frontend/scripts/legalDocuments.test.mjs`
- Modify: `frontend/package.json`

**Interfaces:** produces `siteConfig.registrationNumber`, `LegalDocumentId`, typed paragraph/list blocks, `legalDocuments`, and `findLegalDocument(id)`.

- [ ] **Step 1: Write the failing legal-content test.** Assert the two `id`/`href` pairs, `0205563015465` in terms, the PDPA citation in privacy, every supplied top-level heading, and all company facts.
- [ ] **Step 2: Run `npm run test:legal` from `frontend/`.** Expected: failure because the command and content module do not exist.
- [ ] **Step 3: Add the config boundary.** Use `id: "terms", href: "/legal/terms"` and `id: "privacy", href: "/legal/privacy"`; copy every supplied heading, paragraph and enumerated item. Interpolate only the repeated site-config facts.
- [ ] **Step 4: Run `npm run test:legal` from `frontend/`.** Expected: pass for both complete documents and shared facts.
- [ ] **Step 5: Commit.** Run `git add frontend/src/types/site.ts frontend/src/config/site.ts frontend/src/config/legal.ts frontend/scripts/legalDocuments.test.mjs frontend/package.json && git diff --cached --check && git commit -m "feat: add legal document content"`.

### Task 2: Render canonical routes and privacy alias

**Files:**

- Create: `frontend/src/components/legal/LegalDocument.tsx`
- Create: `frontend/src/components/legal/legal-document.module.css`
- Create: `frontend/src/app/legal/layout.tsx`
- Create: `frontend/src/app/legal/terms/page.tsx`
- Create: `frontend/src/app/legal/privacy/page.tsx`
- Create: `frontend/src/app/privacy/page.tsx`
- Modify: `frontend/scripts/marketplaceRoutes.test.mjs`

**Interfaces:** consumes `findLegalDocument("terms" | "privacy")` and `MarketplaceShell`; produces static `/legal/terms`, `/legal/privacy` and `/privacy` articles.

- [ ] **Step 1: Add canonical and alias legal paths to static-route assertions.** Require `legal/terms`, `legal/privacy`, and `privacy` alongside the existing routes.
- [ ] **Step 2: Run `node --test scripts/marketplaceRoutes.test.mjs` from `frontend/`.** Expected: failure because the legal routes are absent.
- [ ] **Step 3: Add `LegalDocument`.** Render an `article` with one H1, introduction `<p>` elements, H2 headings, paragraphs, `<ol>` and `<ul>` blocks. Put it in an `app/legal/layout.tsx` `MarketplaceShell`; `/privacy` re-exports the canonical privacy page and metadata.
- [ ] **Step 4: Run `npm run test:legal && node --test scripts/marketplaceRoutes.test.mjs` from `frontend/`.** Expected: pass and static HTML for all three URLs.
- [ ] **Step 5: Commit.** Run `git add frontend/src/components/legal frontend/src/app/legal frontend/src/app/privacy frontend/scripts/marketplaceRoutes.test.mjs && git diff --cached --check && git commit -m "feat: publish legal document routes"`.

### Task 3: Add company details and legal links to both footers

**Files:**

- Modify: `frontend/src/components/marketplace/MarketplaceFooter.tsx`
- Modify: `frontend/src/components/marketplace/marketplace.module.css`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/scripts/legalDocuments.test.mjs`

**Interfaces:** consumes populated `siteConfig`; produces visible company facts, `mailto:` support and canonical links in home and marketplace footers.

- [ ] **Step 1: Add failing assertions.** Test that both footer sources contain `/legal/terms`, `/legal/privacy`, `siteConfig.legalCompanyName`, `siteConfig.registrationNumber`, `siteConfig.legalAddress`, and a `mailto:` link.
- [ ] **Step 2: Run `npm run test:legal` from `frontend/`.** Expected: failure because neither footer has all legal and company content.
- [ ] **Step 3: Implement compact footer groups.** Render legal name, registration number, address, and `<a href={\`mailto:${siteConfig.supportEmail}\`}>`; keep the existing home navigation and category blocks intact. Extend only current footer/mobile CSS rules for natural wrapping.
- [ ] **Step 4: Run `npm run test:legal` from `frontend/`.** Expected: pass for both footer surfaces.
- [ ] **Step 5: Commit.** Run `git add frontend/src/components/marketplace/MarketplaceFooter.tsx frontend/src/components/marketplace/marketplace.module.css frontend/src/app/page.tsx frontend/src/app/globals.css frontend/scripts/legalDocuments.test.mjs && git diff --cached --check && git commit -m "feat: show company details in footers"`.

### Task 4: Verify public behavior and record evidence

**Files:** modify this plan only to mark completed checkboxes after actual evidence.

**Verification record (2026-08-10):** `npm run test:legal`, `npm run lint`, `npm run typecheck` and `npm run build` exited 0. The production build listed `/legal/terms`, `/legal/privacy` and `/privacy`; a local production server returned HTTP 200 for each route. Browser inspection could not run because the session had no available browser. `node --test scripts/marketplaceRoutes.test.mjs` remains outside this change: its pre-existing static-export harness expects `out/`, while `next.config.ts` no longer enables static export, so it fails before checking any route.

- [ ] **Step 1: Run automated gates from `frontend/`.** `npm run test:legal`, `node --test scripts/marketplaceRoutes.test.mjs`, `npm run lint`, `npm run typecheck`, and `npm run build` must all exit 0.
- [ ] **Step 2: Inspect `/legal/terms`, `/legal/privacy` and `/privacy` in a browser at desktop and 390px width.** Confirm semantic headings, links, `mailto:`, long address wrapping, visible focus and no horizontal overflow.
- [ ] **Step 3: Inspect and commit final evidence.** Run `git diff --check && git status --short`, update checkboxes with results, then `git add docs/superpowers/plans/2026-08-10-legal-documents-company-details.md && git diff --cached --check && git commit -m "docs: record legal documents verification"`.
