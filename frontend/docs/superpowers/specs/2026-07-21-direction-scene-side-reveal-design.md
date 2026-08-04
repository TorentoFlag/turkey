# Direction scene side-reveal animation

## Goal

Match the supplied Floema reference for the five direction scenes on the homepage. When a scene becomes active during scroll, its small content objects should enter from the side in a deliberate stagger: metadata first, then badge, heading, description, and CTA. The background image should transition independently and remain calm behind the content.

## Scope

- Apply the behavior to the five scenes rendered by `DirectionStory`.
- Keep the existing sticky media stage, scene selection, layout variants, and responsive structure.
- Do not add new routes or change copy, imagery, or navigation.
- Preserve reduced-motion behavior.

## Interaction design

Each scene has a stable content group containing:

1. direction number and divider line;
2. category badge;
3. heading;
4. description;
5. CTA link.

On activation, the group enters from the side with a short upward settle. Items use a sequential stagger with a small overlap so the scene feels assembled rather than delayed. The title receives the strongest movement and the CTA the lightest movement. On deactivation, the outgoing content fades and shifts only slightly to avoid competing with the incoming scene.

The side is derived from navigation direction: scrolling down makes the incoming scene enter from the right; scrolling up makes it enter from the left. The first scene uses the same right-entry treatment on initial load. Direction changes are determined from the active scene index, not from individual IntersectionObserver callbacks.

The media stage keeps its existing crossfade and scale treatment. Content animation is handled independently so text remains readable while images transition.

## Technical design

- Add a focused GSAP timeline controller inside `DirectionStory`.
- Track the previous active index in a ref and derive `direction` from the index delta.
- Animate direct child elements with `data-direction-part` attributes so the timeline remains explicit and accessible.
- Use `gsap.context` and kill/revert the current timeline on unmount.
- Keep the current CSS state as a no-JavaScript/reduced-motion fallback; full-motion rules will only provide the initial hidden state when motion is enabled.
- Avoid animating layout properties. Use `transform`, `opacity`, and optionally `clip-path` only where it does not affect layout.
- Do not animate hidden scenes on every scroll tick; run one timeline only when `activeIndex` changes.

## Responsive and accessibility behavior

- Desktop and mobile use the same sequence, with smaller travel distance on narrow viewports.
- `prefers-reduced-motion: reduce` disables transforms and stagger, leaving content visible.
- Text remains in the DOM and retains normal reading order.
- The animation must not introduce horizontal overflow or interfere with focus states.

## Verification

- Run the existing homepage verification at all configured viewports.
- Confirm the full-motion lifecycle emits no browser errors.
- Confirm scene changes in both scroll directions and the first scene on initial load.
- Confirm reduced-motion mode shows all scene content without delayed visibility.
- Inspect the local page visually at desktop and mobile widths.
