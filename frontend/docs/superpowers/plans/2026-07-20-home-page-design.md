# Home Page Design Implementation Plan

> Scope lock: implement only the Russian-language homepage. No catalogue, product page, checkout, account, FAQ, or internal-page design.

## Goal

Create a complete image-led editorial homepage for travel across Turkey, carrying the same long-form dramatic rhythm as Floema without copying its composition, brand, media, or code.

## Dramaturgy

1. A quiet full-viewport Bosphorus opening with oversized promise and integrated navigation.
2. One long five-act sticky scene in which destination media, number, title, and progress replace each other.
3. A typographic manifesto that changes the page from atmosphere to useful service.
4. Three deliberately different editorial compositions for ideas, current services, and collections.
5. A typographic low-price index and a cinematic bundle diptych rather than product grids.
6. A trust statement, spatial three-step sequence, full-bleed closing image, newsletter, and homepage footer.

## Implementation

- Build the semantic homepage in `src/app/page.tsx` from server-rendered section components.
- Keep interactive behavior in a small client component using `IntersectionObserver`, keyboard events, and CSS transitions.
- Add local Manrope and Literata faces, design tokens, responsive grid, image treatments, reveal utilities, and reduced-motion fallbacks in `src/app/globals.css`.
- Use local licensed photographs with source records in `public/images/CREDITS.md`.
- Keep all future navigation as in-page anchors or explicitly disabled placeholder controls, without creating additional routes.
- Verify structure, media loading, console output, overflow, reduced motion, and the mobile menu at 1440px and 390px.

## Visual review gates

- Every section must have a different spatial composition.
- No repeated white cards, equal tile grids, generic travel iconography, blue gradients, or conventional landing-page CTA bands.
- Photography remains dominant and text stays short, large, and breathable.
- Motion supports scene changes and hierarchy; the stopped page remains visually complete.
- Mobile is a vertical editorial montage, not a compressed desktop layout.
