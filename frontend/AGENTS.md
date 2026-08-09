# Frontend instructions

Read `../AGENTS.md` and the relevant files in `../docs/` before working here. The root documentation defines the product and target architecture; this file only adds frontend-specific rules.

## Current state

This directory is a design/prototype Next.js application, not a production commerce frontend. It currently contains mock catalogue data, localStorage account/order logic, a local multi-item cart and a fake card form. They are historical UI material and must not be extended as product logic.

When implementing the approved product, replace them with typed API access to the backend:

- `src/lib/marketplace/local-store.ts` and `AccountGate.tsx`: server auth/session, never browser-stored passwords;
- `CheckoutForm.tsx`: Arc Pay Hosted Checkout redirect, never card fields;
- `AccountOrders.tsx`: `GET /v1/me/orders`; не показывать и не использовать внутренний менеджерский признак `isProcessed`;
- mock catalogue and fixed category unions: API-driven categories/products;
- cart and static checkout: one product/order flow chosen by product type.

Do not make these deletions in an unrelated visual task. First agree the API contract and implement the corresponding vertical slice.

## UI rules

- Preserve usable visual ideas from `DESIGN_DIRECTION.md`, but treat it as a design reference, not business or technical truth.
- Keep interface Russian unless a product decision changes it. Public brand name stays configurable.
- Retain image attribution in `public/images/CREDITS.md`; use image URLs supplied by API for catalog data.
- UI cannot be authoritative for money, checkout outcome, permissions or status transitions. No `localStorage` for those facts.
- Do not read or write private server secrets in Next public environment variables.
- Verify changed customer flows in a real browser as well as lint/typecheck/build.

## Existing commands

From this directory: `npm run lint`, `npm run typecheck`, `npm run build`. Inspect `package.json` before adding packages or changing scripts.

## Historical materials

`docs/superpowers/` is a preserved designer/prototype history. It may be read for visual reasoning only. Its requirements for static export, GitHub Pages, mock/localStorage state, fake payments, fixed taxonomy and no backend/auth are superseded by `../docs/`.
