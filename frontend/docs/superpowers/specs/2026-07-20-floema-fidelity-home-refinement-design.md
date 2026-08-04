# Floema-Fidelity Home Refinement Design

## Status

Approved design direction for a full refinement of the existing Russian-language Turkey homepage. This specification covers only the homepage and does not authorize catalogue, service detail, checkout, account, FAQ, backend, CMS, or internal-page work.

## Objective

Rebuild the homepage interaction and spatial system so that it reaches the structural and motion fidelity of the current Floema homepage while retaining original Turkey-focused content, photography, brand treatment, and product meaning.

The target is not a visual copy of Floema assets or code. The target is equivalent page dramaturgy:

- an atmospheric full-viewport opening;
- one long, controlled, pinned five-act story;
- a deliberate shift from immersive media to editorial and commercial content;
- large-scale typography with long pauses and sparse information density;
- section-specific scroll choreography;
- a mobile version designed as its own sequence rather than a compressed desktop page.

## Reference anatomy

The current Floema homepage was inspected at 1440 × 900 and 390 × 844.

At desktop size its approximate structure is:

1. A 100vh hero rendered as a pinned canvas with a continuous vertical stream of floating image fragments and a centred statement. The following section rises over the pinned hero instead of pushing it away immediately.
2. A five-act media story occupying approximately 8100 px, from about 900 px to 9000 px. The viewport remains the stage while backgrounds, category metadata, headlines, actions, and auxiliary panels change with scroll progress.
3. A manifesto/editorial area with oversized low-contrast text and a floating story card.
4. A two-item recent-additions display with isolated product imagery and very low interface density.
5. A sticky collections composition where oversized names, counts, icons, and images interrupt one another.
6. A dark statement scene with asymmetric partner copy and a dominant media field.
7. Three horizontally distributed principles.
8. A large closing statement, newsletter, and graphic footer treated as one ending sequence.

On mobile, the hero and five category acts remain close to full viewport height. Header controls become compact floating pills. Category text moves lower in the frame, media remains dominant, and contextual panels sit near the bottom edge. The lower sections become vertical but retain large scale and generous pauses.

## Selected implementation approach

Use a hybrid rendering system:

- **Three.js** for the hero collage and the five-act image stage where texture transitions, crop changes, and continuous scroll interpolation materially improve fidelity.
- **GSAP with ScrollTrigger** for scroll-linked timelines, pinned sections, text reveals, mask transitions, and section progress.
- **Lenis** for controlled smooth scrolling, synchronised with ScrollTrigger.
- **React and semantic DOM** for all readable content, controls, forms, links, navigation, and accessibility states.
- **CSS** for layout, typography, non-critical hover states, responsive design, and reduced-motion fallbacks.

Three.js must not become the page layout engine. Canvas is limited to media presentation. Text and controls remain selectable, accessible DOM content.

## Homepage structure

### 1. Adaptive header

- Fixed above the complete page.
- Desktop navigation becomes one measured SVG surface made from connected light pills. Turkey-specific labels remain original, while the geometry and interaction follow the reference precisely: 12 px segment radii, 6 px resting gaps bridged by the SVG shape, 20 px expansion around the hovered segment, a 4 px active dot, and a pointer-following radial glow clipped to the pill surface.
- Hover expansion uses `cubic-bezier(.175,.885,.32,1.275)` over 500 ms; the return uses `cubic-bezier(.19,1,.22,1)` over 300 ms. The treatment is spatial and restrained, not a generic colour-fill hover.
- Brand and search remain on the left; language, currency, and menu utility remain on the right.
- Header tone follows the active scene with a short crossfade rather than abrupt class changes.
- On mobile, the brand sits left and language/menu form a small floating control group on the right.
- Existing accessible modal menu, focus trap, focus return, and skip-link behaviour remain.

### 2. Hero canvas

- Height: 100svh desktop and mobile.
- Background: warm museum-like paper rather than a full-bleed tourism photograph.
- Between 18 and 24 Turkey image fragments appear at different scales and depths. They use original or newly sourced and credited Turkey photography crops: boutique and historic hotels, architecture, water, signage, textures, markets, ferry details, Istanbul, Cappadocia, Ephesus, Pamukkale, Bodrum, and the Mediterranean coast.
- The central promise remains readable DOM text above the canvas.
- The central promise is the only hero copy: `Всё необходимое — от первого трансфера до лучших впечатлений`, split into two balanced lines with no hero CTA buttons.
- Fragments move continuously upward and wrap below the viewport. Near fragments are larger, higher contrast, and faster; middle fragments are smaller; distant fragments are pale and slow. The stream is autonomous at rest and gains only a subtle velocity lift from scrolling.
- The hero is pinned for one viewport with no added spacing. The first direction scene rises over it and naturally crops the central statement, matching the reference transition.
- Movement is restrained: vertical depth translation, slight horizontal drift, scale, crop, and opacity. No rotation spectacle, bounce, collision physics, or random re-layout after hydration.
- The existing hero photograph remains available as the reduced-motion and WebGL-failure fallback.

### 3. Five-act direction story

- Total scroll length: approximately 850–900svh on desktop.
- A single pinned 100svh stage contains all five acts.
- Each act owns a progress interval and has:
  - two-digit number;
  - compact accent label;
  - horizontal rule;
  - short headline;
  - CTA;
  - dominant full-frame Turkey photograph;
  - contextual panels in act 01 for curated historical routes and act 05 for traveller support.
- Transitions combine texture crossfade, mask movement, focal-point interpolation, headline line reveal, and metadata replacement.
- Scene changes are scrubbed. They do not wait for an IntersectionObserver threshold.
- Each image is decoded before its interval begins. The next scene is prepared while the current scene is active.
- Header tone and navigation contrast are driven by the same timeline state.
- Desktop composition remains stable enough that fast scroll never exposes an empty frame.

Mobile implementation:

- Five sequential near-fullscreen acts in document flow.
- Short local pinning may be used inside an act, but the complete five-act sequence is not globally pinned.
- Text remains DOM content over the lower half of the image.
- Context panels remain within the safe area and never cover the main action.
- Reduced motion uses static images and immediate content visibility.

### 4. Manifesto and editorial story

- A pale, naturally flowing section after the immersive story.
- The manifesto is broken into large lines with low initial contrast.
- Scroll progress raises contrast phrase by phrase and subtly changes tracking.
- One editorial photograph and its caption travel through the negative space without covering the primary text.
- On mobile, the text and photograph become sequential; no overlapping small type.

### 5. Featured services

- Replace the current uniform service index with two large, isolated service compositions.
- One horizontal arrival kit combines a dark key fob, transfer card, and eSIM sleeve.
- One vertical Bosphorus kit combines a folded route sheet and ferry ticket.
- Each includes service name, location, mock price, colour/state metadata, and one clear action.
- Both kits use project-specific transparent WebP assets created for this homepage and must feel like exhibited objects, not white ecommerce cards.
- A short transition links the two items before the collections section begins.

### 6. Collections

- A sticky 100svh desktop composition within a taller scroll container.
- Five oversized collection names and counts form a vertical typographic object.
- A different image interrupts each line and moves within a constrained depth range.
- Active collection changes with scroll and keyboard/touch selection.
- Existing destination names and counts remain, with corrected photography.
- Mobile uses a vertical sequence of large collection rows with one image embedded in every row. It does not depend on hover.

### 7. Statement scene

- Full-width deep green scene, approximately 95–110svh desktop.
- Asymmetric team statement occupies the left and centre grid.
- A dominant image field occupies the right and reveals through a rectangular mask.
- Existing honest team attribution remains; no invented founder biography.
- The scene acts as the main tonal break before process and conversion.

### 8. Principles

- Three concise principles distributed horizontally at different baseline positions.
- A large closing line enters from the lower-left.
- Scroll reveal is staggered but not pinned for longer than one viewport.
- Mobile stacks the principles without decorative percentage offsets.

### 9. Closing, newsletter, and footer

- The final CTA becomes a typographic closing statement rather than another full-bleed hero photograph.
- Newsletter shares the same scene and remains an honest prototype form.
- Footer receives a distinct warm yellow-green field and original line artwork derived from Turkish architectural or transport geometry.
- Line artwork is newly created for this project; no Floema illustrations are copied.
- Footer contains only homepage navigation and existing legal placeholders.

## Motion system

### Core timing

- Standard reveal: 600–900 ms.
- Major mask transition: 900–1400 ms.
- Scroll scrub smoothing: approximately 0.6–1.0 seconds.
- Header tone transition: 300–450 ms.
- Hover response: 220–420 ms.
- Easing should favour `power2.out`, `power3.out`, and custom cubic curves without elastic or bounce behaviour.

### Scroll behaviour

- Lenis drives scroll position with `smoothWheel: true`; ScrollTrigger is updated from the same animation frame.
- Lenis may smooth native wheel deltas, but it must never convert wheel input into section-by-section navigation. There is no forced scroll snapping, scroll lock, or mandatory scene jump.
- Refresh calculations run after fonts and critical images are ready.
- Resize handling preserves the nearest logical scene instead of resetting the page.
- Direct anchor navigation resolves to a stable point within the associated section.

### Transition grammar

- Hero: continuous vertical depth stream; the next section covers the pinned canvas.
- Direction story: full-frame media replacement with scrubbed masks.
- Manifesto: contrast accumulation and floating editorial media.
- Featured services: object-stage translation and scale.
- Collections: sticky typographic traversal with image interruptions.
- Statement: rectangular media reveal and text stagger.
- Principles: baseline-based stagger.
- Closing: typography settles while footer artwork enters.

No two adjacent sections use the same entrance and exit treatment.

## Component boundaries

- `HomePage`: semantic section order only.
- `AdaptiveHeader`: navigation state, tone, menu, and accessibility.
- `HeroCanvasScene`: Three.js lifecycle and hero textures.
- `DirectionCanvasStory`: scene timeline, canvas textures, DOM overlays, and progress.
- `ManifestoSequence`: text and editorial-media timeline.
- `FeaturedServicesStage`: two service compositions and transitions.
- `CollectionsStage`: sticky collection state and accessible interaction.
- `StatementScene`: media mask and team copy.
- `PrinciplesSequence`: three-step timeline.
- `HomeClosing`: final statement, newsletter, and footer artwork.
- `MotionProvider`: Lenis and GSAP integration, reduced-motion state, refresh, and cleanup.

Homepage data remains separate from rendering components. Components receive typed content and media descriptors rather than importing unrelated marketplace datasets.

## Data and state flow

- Server-render the complete semantic page and all readable copy.
- Hydrate only motion and interactive leaves.
- `MotionProvider` exposes reduced-motion and readiness state.
- ScrollTrigger timelines own visual progress; they do not write business state.
- Direction and collection active indices update ARIA state only when the logical scene changes, not on every animation frame.
- Canvas scenes receive prevalidated local asset paths and focal points from typed homepage data.

## Graceful degradation and error handling

- Without JavaScript, every section is visible in normal document flow.
- Without WebGL, canvas scenes swap to layered DOM images using the same content.
- With `prefers-reduced-motion`, Lenis is disabled, pins are shortened or removed, and all content is immediately visible.
- With `save-data`, canvas device-pixel ratio is capped at 1 and non-critical textures are loaded only near their sections.
- Missing media displays a deliberate solid field and readable text; it must never create a blank viewport.
- Form copy remains explicit that persistence is not connected during this phase.

## Performance constraints

- Cap canvas DPR at 1.5 desktop and 1.25 mobile.
- Keep only the current, previous, and next full-frame textures resident at high resolution; retain lightweight placeholders for the other two scenes.
- Pause requestAnimationFrame work when canvas scenes are offscreen or the document is hidden.
- Use compressed local WebP/AVIF derivatives for canvas textures while retaining JPEG fallbacks.
- Avoid layout reads inside animation-frame loops.
- Lazy-load lower-page media, but decode the next direction scene in advance.
- Target a stable 50–60 fps on a modern laptop and 30–60 fps on a contemporary mobile device.

## Accessibility

- Canvas remains decorative and `aria-hidden`.
- All headings, labels, descriptions, and CTAs exist in semantic DOM.
- Keyboard navigation does not depend on scroll timing.
- Focus indicators remain visible above canvas and masks.
- Modal menu retains focus trap, inert background, Escape close, and focus return.
- Active collection controls use `aria-pressed`; direction progress has a readable section label outside the decorative canvas.
- Colour contrast is checked in every header state and over every media crop.

## Testing and visual verification

### Automated

- ESLint, TypeScript, and production build.
- Homepage structure and anchor target checks.
- No-JavaScript content visibility.
- Reduced-motion flow without negative offsets or overlapping pins.
- Menu, search, collection controls, and newsletter interaction.
- No horizontal overflow at 390, 430, 768, 1024, and 1440 px.
- Canvas fallback when WebGL initialisation is forced to fail.

### Visual

- Compare keyframes against Floema at hero, each of five story acts, manifesto midpoint, featured services, collections, statement, principles, closing, and footer.
- Review at 1440 × 900 and 390 × 844, then spot-check 430, 768, and 1024 widths.
- Verify slow scroll, fast scrub, reverse scroll, resize, direct anchors, and background-tab return.
- Every section must remain visually complete in a paused screenshot.

## Acceptance criteria

- The homepage follows the same structural rhythm as the current Floema reference while remaining recognisably about Turkey.
- The hero and five-act story feel continuous rather than like independent stacked sections.
- Scroll progress controls media and typography directly in the primary story.
- Lower sections reproduce Floema's alternation of manifesto, isolated commercial objects, oversized collections, statement, principles, and graphic ending.
- Desktop and mobile each have intentional composition and motion.
- No template-like card grids, tourism clichés, copied Floema assets, copied source code, or newly designed internal pages are introduced.
- The page remains accessible and readable when motion or WebGL is unavailable.

## Non-goals

- Catalogue architecture or routes.
- Service detail pages.
- Checkout, account, authentication, CMS, backend, or payments.
- Real prices, inventory, booking, newsletter persistence, or external APIs.
- Copying Floema branding, illustrations, photography, product assets, text, or source code.

## Primary risks and mitigations

- **Canvas weight:** restrict Three.js to two sections and cap DPR.
- **Motion regressions:** keep complete DOM fallbacks and centralise timeline cleanup.
- **Mobile jank:** avoid the long global pin used on desktop and reduce resident textures.
- **Reference overfitting:** preserve Turkey content, original media, and service meaning while matching interaction relationships.
- **Scope expansion:** all actions remain anchors or prototype states on the homepage.
