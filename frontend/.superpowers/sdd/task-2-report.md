# Task 2 — marketplace shell and primitives

## Status

Implemented and committed the independent marketplace shell and reusable primitives. Homepage code, styles, data, and assets were not modified.

## Commit

`b0f8dd5 feat: add marketplace shell primitives`

## Changed files

- `src/components/marketplace/MarketplaceShell.tsx`
- `src/components/marketplace/MarketplaceHeader.tsx`
- `src/components/marketplace/MarketplaceFooter.tsx`
- `src/components/marketplace/MarketplaceBreadcrumbs.tsx`
- `src/components/marketplace/ServiceCard.tsx`
- `src/components/marketplace/FilterPanel.tsx`
- `src/components/marketplace/marketplace.module.css`
- `src/app/catalog/layout.tsx`
- `src/app/search/layout.tsx`
- `src/app/destinations/layout.tsx`
- `src/app/marketplace-error.tsx`
- `scripts/marketplaceCatalog.test.mjs`

## Verification

| Check | Result |
| --- | --- |
| `node --test scripts/marketplaceCatalog.test.mjs` | Passed: 4/4 tests. The added smoke test verifies internal navigation paths, unique service slugs, and local public image paths. |
| Targeted marketplace lint | Passed: `npx eslint src/components/marketplace src/app/catalog/layout.tsx src/app/search/layout.tsx src/app/destinations/layout.tsx src/app/marketplace-error.tsx scripts/marketplaceCatalog.test.mjs` |
| `npm run build` | Passed, including Next.js TypeScript validation and static build. |
| `git diff --check` | Passed with no whitespace errors. |
| `npm run lint` | Failed on pre-existing files and generated `.next` output under the nested `.worktrees/floema-home` checkout, plus existing homepage lint errors. No marketplace task files were reported. |
| `npm run typecheck` | Failed because TypeScript includes conflicting generated global route types from the nested `.worktrees/floema-home/.next` directory; its stale `LayoutProps` declaration accepts only `/`, while the current repository now has `/catalog`, `/destinations`, and `/search` layouts. The production build's own TypeScript validation passed. |

## Concerns

- The repository's broad lint and standalone typecheck are currently polluted by generated artifacts in the nested `.worktrees/floema-home` checkout. These are outside Task 2 scope and were not changed.
- The report is intentionally not included in the implementation commit because the approved commit command names only the application files and smoke test.

## Review fix: route-segment error boundaries

### Fixed

- Added `error.tsx` client boundaries to `/catalog`, `/search`, and `/destinations`.
- Each boundary re-exports the existing `marketplace-error` UI, preserving retry and catalog navigation without changing homepage files.

### TDD: RED → GREEN

1. Added a marketplace smoke assertion requiring all three route segments to define a client `error.tsx` that reuses the marketplace error UI.
2. Before implementation, `node --test scripts/marketplaceCatalog.test.mjs` failed as expected: `catalog must define error.tsx`.
3. Added the three thin route-boundary modules; the same smoke test then passed.

### Verification

| Check | Result |
| --- | --- |
| `node --test scripts/marketplaceCatalog.test.mjs` | Passed: 5/5 tests. |
| Targeted lint | Passed: `npx eslint src/app/marketplace-error.tsx src/app/catalog/error.tsx src/app/search/error.tsx src/app/destinations/error.tsx scripts/marketplaceCatalog.test.mjs` |
| `npm run build` | Passed: Next.js production compilation and TypeScript validation completed successfully. |
| `git diff --check` | Passed with no whitespace errors. |

### Changed files

- `src/app/catalog/error.tsx`
- `src/app/search/error.tsx`
- `src/app/destinations/error.tsx`
- `scripts/marketplaceCatalog.test.mjs`
- `.superpowers/sdd/task-2-report.md`
