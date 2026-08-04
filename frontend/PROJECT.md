# Frontend project context

The product is a Russian-language tourist marketplace for Turkey with manual fulfilment. The authoritative product rules are [../docs/product/business-rules.md](../docs/product/business-rules.md) and the target architecture is [../docs/architecture/overview.md](../docs/architecture/overview.md).

This Next.js application is the customer-facing frontend. It will display API-managed categories/subcategories and products, require registration before any order, send paid orders to Arc Pay Hosted Checkout, and show a user's order history. The separate shared admin frontend is outside this repository; it uses the backend Admin API.

The public brand name is intentionally configurable. Interface language is Russian until a product decision says otherwise.

## Visual reference

[Floema](https://www.floema.com/en) and `DESIGN_DIRECTION.md` are visual/compositional references only: editorial rhythm, large imagery, typography, motion, responsive layout and accessibility. Do not copy its brand, assets, text, legal information or source code. Do not treat the old single-homepage scope as an implementation limit.

## Superseded prototype assumptions

The following are not valid production decisions: static-only export, GitHub Pages deployment, mock catalogue/provider snapshots, localStorage authentication/orders, local cart, direct card fields, fake paid status and absence of backend/API/payment/auth. They remain in the source only as UI migration material until an approved vertical slice replaces them.
