# Directions catalog design

**Status:** approved for planning

## Goal

Replace the static, placeholder-driven "Направления" area with an authoritative
catalog domain managed through VV Admin. A visitor sees only live directions
and their curated service collections; an authenticated VV Admin user manages
direction copy, cover image, visibility and the ordered many-to-many relation
between products and directions.

## Confirmed decisions

- A direction is not a catalog category. Categories retain their current
  two-level product-taxonomy role.
- A product may belong to zero, one or several directions. This accommodates
  city-specific services as well as country-wide services such as eSIM.
- Direction membership has its own `sortOrder`, so a product can be first in
  Bursa and later in Istanbul without changing the global product order.
- All 15 directions from the current design are imported as editable records.
  A direction is public only after it is active and has at least one active,
  publicly visible product in its collection. Thus no public direction page
  has the current placeholder or an empty collection.
- Direction cover images are uploaded through the existing server-side MinIO
  flow. VV Admin browsers never receive a Turkiye Admin API key or object
  storage credentials.
- Turkiye remains the source of truth. VV Admin reaches it only through the
  existing typed `turkiye_v1` catalog connector and supplies the trusted
  authenticated user ID as the audit actor.

## Options considered

### 1. First-class directions and an ordered product relation (chosen)

Turkiye stores direction metadata and a `product_destinations` relation.
VV Admin gains capability-gated direction management, while the public
frontend reads Turkiye's public API. This preserves foreign keys, activation,
per-direction ordering and a clean boundary for future compatible stores.

### 2. Represent directions as categories

Rejected. It would mix service taxonomy with geography, violate the current
strict two-level category rule and make a product in Istanbul and Bursa
impossible without duplication.

### 3. Store a JSON/string list of direction slugs on products

Rejected. It has no referential integrity, no safe deletion rule, no
per-direction order and does not model editable direction copy or images.

## Data model and invariants

Turkiye adds two tables through an append-only Drizzle migration:

```text
destinations
  id UUID primary key
  name TEXT not null
  slug VARCHAR(160) unique not null
  region TEXT not null
  description TEXT not null
  image_url TEXT nullable
  sort_order INTEGER not null default 0
  is_active BOOLEAN not null default true
  created_at, updated_at timestamps

product_destinations
  product_id UUID references products(id)
  destination_id UUID references destinations(id)
  sort_order INTEGER not null default 0
  primary key (product_id, destination_id)
```

Indexes cover active direction listing and lookup of active products for a
direction. The relationship is not copied into order snapshots because it is
editorial catalog metadata and does not affect checkout, payment, booking,
refund or order processing.

A direction may be created as active without a product, but it is omitted from
all public responses until it has a visible product. Deleting a direction is
rejected while any product relation exists; VV Admin can deactivate it first
or remove its relations deliberately. Deactivating a product, category or
direction automatically removes that card from public direction results.

## Turkiye API and domain boundary

The existing `catalog` module owns directions; a new service is not needed.
The product, payment and order contracts remain unchanged.

### Protected Admin API

All routes remain behind `AdminApiKeyGuard`, require both existing trusted
headers and create Turkiye audit records using the supplied actor ID.

```text
GET    /v1/admin/destinations
POST   /v1/admin/destinations
PATCH  /v1/admin/destinations/:id
DELETE /v1/admin/destinations/:id

PUT    /v1/admin/destinations/:id/products/:productId
DELETE /v1/admin/destinations/:id/products/:productId
```

The upsert membership body contains only `sortOrder`. It rejects unknown or
inactive target records and uses a transaction for the relationship write and
audit entry. Direction create/update accept JSON when no image is supplied or
the same constrained multipart pattern as product mutation when a cover photo
is supplied.

Direction validation mirrors established catalog guarantees: trimmed,
non-empty name/region/description; lowercase dashed unique slug; bounded
lengths; integer order; explicit active state. A delete request has no hidden
cascade.

### Public API

```text
GET /v1/public/destinations
GET /v1/public/destinations/:slug
GET /v1/public/products?destinationSlug=<slug>
```

The list returns only publishable directions with lightweight card fields and
`productCount`. The detail endpoint returns the direction and its ordered,
public product cards in one response. It returns 404 for inactive, empty or
unknown direction slugs. The existing product list accepts one optional
`destinationSlug`; it composes safely with the existing optional category
filter and never exposes inactive products, categories or directions.

Public product shape remains compatible; adding direction summaries is not
required for this slice. Existing `/v1/public/products`, individual product,
checkout and order routes keep their semantics.

## Media lifecycle

The media module is generalised from product-only handling to catalog media.
Direction cover objects use a generated key below:

```text
destinations/<destination UUID>/<random UUID>.webp
```

The same JPEG/PNG/WebP allowlist, actual-content decode, size and dimension
limits, WebP normalisation and generated names apply. The existing worker
cleanup scans both `products/` and `destinations/`; it deletes only old,
unreferenced generated objects and never external URLs. Replacing a cover
deletes the previous managed direction object only after the database update;
a failed write deletes the just-created object.

## VV Admin connector and workspace

The generic connector capability is extended with an optional typed
`destinations` capability. `turkiye_v1` enables it; future connectors do not
receive a directions UI merely because they are standard stores.

The shared domain/contracts add `CatalogDestination` and
`CatalogDestinationProduct` DTOs plus explicit connector methods for list,
create, update, delete and membership changes. `TurkiyeCatalogConnector`
maps those methods to only the protected Turkiye routes above, maintaining its
current HTTPS-only requests, timeout, redirect rejection, secret redaction
and trusted actor forwarding.

VV Admin's existing Catalog Management page gains a fourth,
capability-gated tab, **«Направления»**:

1. direction table with cover preview, name, region, slug, visible-product
   count and status;
2. create/edit dialog for copy, ordering, activation and one cover upload;
3. collection editor that searches the authoritative product list, adds or
   removes a product and edits its direction-specific sort order;
4. destructive confirmation before deleting either a relation or an empty
   direction; remote validation/conflict/unknown-outcome behavior follows the
   existing catalog workspace.

VV Admin records its requested/succeeded/failed/unknown audit lifecycle
without direction description text, files, image bytes or secrets. Turkiye
records immutable resource-level audit actions independently.

## Frontend behavior

`/destinations` and `/destinations/[slug]` stop importing
`marketplaceDestinations`. They read the public API at request time, so a
published VV Admin change is visible without rebuilding the Next.js image.
Static `generateStaticParams` is removed because the slugs are now data.

The index renders only API-provided cards. The detail page renders its hero,
breadcrumbs, cover and real product cards from its one detail response. Its
catalog link is `/catalog?destination=<slug>`. The catalogue client accepts
that filter and uses the new public API parameter. Not-found and temporary
network states retain standard Next.js error behaviour; there is no catalog
placeholder message.

Legacy demo-only form/filter components that still import static destination
data are outside the live catalog path. This implementation identifies them
explicitly and either migrates their selectors to the public API or removes
the obsolete demo route in the same frontend slice; no live screen may keep
static direction authority after completion.

## Initial data migration

A versioned, idempotent local script imports only through the Turkiye Admin
API with a dedicated audit actor. It reads the existing design source and
local assets, verifies an expected 15-direction manifest, uploads each cover
through the Admin API and creates missing records by slug. Reruns validate
the existing record rather than overwriting editorial changes.

The script then reads the live product list and creates direction relations
for the 84 design products with a city value that exactly matches an imported
direction. Nine records without a city remain unassigned; country-wide
visibility is a conscious editor decision, not an automatic inaccurate
assignment. `bursa-shopping-day` additionally receives Bursa membership even
though the legacy source has Istanbul as its departure city. Its Istanbul
membership stays so both relevant travel contexts can expose it.

The initial import creates all fifteen direction records. Directions without
an active relation stay inactive/draft and therefore absent from the public
index until an editor provides a legitimate collection. It does not create,
rename, delete or overwrite products, categories, prices, payment types or
photos.

## Verification and acceptance

### Automated

- Migration and schema tests prove constraints, composite uniqueness and
  relationship deletion rules.
- Turkiye catalog unit/integration tests prove protected Admin authorization,
  validation, audit actions, media rollback/replacement, visibility filtering,
  public detail order and category-plus-direction product filtering.
- VV Admin domain, connector, controller and UI tests cover capability gating,
  exact remote requests, actor forwarding, image multipart forwarding, safe
  error mapping and collection mutations.
- Frontend tests cover API data loading, published direction card/detail
  rendering, catalog-link filter and 404/temporary-error state.
- Existing catalog, order, checkout, payment, refund and media tests continue
  to pass unchanged in their observed behaviour.

### Runtime

With both services in a controlled local environment, use VV Admin to create
a direction with a photo, create or select a product, add it to the
collection, set its order and activate the direction. Verify in a browser:

1. the card appears on `/destinations`;
2. the direction page shows its uploaded cover and ordered real product card;
3. the card opens the existing product page;
4. the catalogue link returns the same product set;
5. deactivating the direction removes it from the public index and its old
   slug returns 404.

The production migration and data import require their own preflight, backup,
dry-run, Admin API verification and explicit deployment approval. No payment,
refund, order, user or notification operation is part of this slice.

## Explicit non-goals

- A third category level or geography encoded as categories.
- Supplier availability, map/geo search, routes, hotels, travel dates or
  automated provider synchronization.
- Multiple direction cover images, galleries, rich-text/SEO editors or a
  general media library.
- Implicit assignment of nation-wide products to every direction.
- Browser access to Turkiye Admin API or MinIO credentials.
