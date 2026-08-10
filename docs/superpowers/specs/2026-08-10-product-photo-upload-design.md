# Product Photo Upload Design

**Status:** approved for planning

## Goal

Let an authenticated VV Admin user attach one product photo while creating or
editing a Turkiye catalog product. The photo must become a durable public
product image without exposing object-storage credentials to a browser.

## Confirmed decisions

- A product has at most one primary photo. A gallery, categories' photo upload,
  cropping UI, bulk upload and responsive derivatives are out of scope.
- MinIO is the S3-compatible object storage for Turkiye. It runs as an
  internal service in Turkiye's production Compose stack with a persistent
  volume.
- The product catalog remains authoritative in Turkiye. VV Admin is only the
  authenticated administrative client and never owns MinIO credentials.
- The existing nullable `products.image_url` remains the product image value.
  Existing external URLs stay valid and the database requires no migration.
- New product photos are optional, matching the current nullable image field.
  VV Admin replaces its manual product-image URL input with file selection;
  the JSON Admin API remains compatible for existing callers and legacy URLs.

## Chosen architecture

```text
VV Admin browser
  POST multipart/form-data, authenticated session
        |
        v
VV Admin CatalogController and CatalogService
  server-to-server multipart request; Turkiye key and actor header
        |
        v
Turkiye Admin Product API
  validate, decode and normalise image; own product/image mutation
        |
        v
MinIO private network service and persistent volume
        |
        v
public https://turkeyplanners.com/media/products/<product-id>/<asset-id>.webp
```

The browser does not call Turkiye or MinIO directly. This deliberately avoids
browser storage credentials, direct-upload CORS policy, presigned-URL expiry
and a separate finalisation protocol. The extra server hop is acceptable for
infrequent, small administrative uploads.

MinIO exposes no host port and its Console is not reverse-proxied. A reverse
proxy serves only the bucket's public read path beneath `/media/`; it does not
forward listing, write, deletion or Console endpoints. The bucket allows
anonymous read only for product objects. Turkiye API and worker use a distinct,
least-privilege MinIO access key for object write, list and delete; they never
use the MinIO root credentials.

## HTTP and connector contracts

The current JSON product mutations remain valid:

```text
POST  /catalog/sites/:siteId/products
PATCH /catalog/sites/:siteId/products/:productId

POST  /v1/admin/products
PATCH /v1/admin/products/:productId
```

Each endpoint additionally accepts `multipart/form-data` with these parts:

| Part | Required | Meaning |
| --- | --- | --- |
| `product` | yes | A UTF-8 JSON object matching the existing product input DTO. |
| `photo` | no | One image file. |

When `photo` is absent, behavior is unchanged. When it is present, a non-null
`imageUrl` in `product` is rejected as ambiguous; Turkiye produces the URL.
VV Admin sends the product payload as JSON if no file was selected and as
multipart only when a file was selected. The shared catalog capability gains a
typed `productPhotoUpload` descriptor so a future connector can opt out or
declare different limits without UI branching on `turkiye_v1`.

`CatalogConnector.createProduct` and `updateProduct` gain an optional typed
photo argument. `TurkiyeCatalogConnector` forwards it as native `FormData`,
with the existing `X-Admin-Api-Key` and `X-Admin-Actor-Id` headers. It does not
log the file bytes, original filename, remote response body or secret.

## Image handling and storage lifecycle

Turkiye accepts only one JPEG, PNG or WebP upload of at most 5 MiB. It enforces
the multipart limit before buffering, checks detected content rather than
trusting the browser MIME type or filename, decodes the image, applies EXIF
orientation, limits its longest side to 2560 pixels and re-encodes it as WebP
at quality 82. SVG, GIF, HEIC, archives and any undecodable image are rejected.

The server generates every object key:

```text
products/<product UUID>/<random UUID>.webp
```

No request-controlled path, filename or extension reaches object storage. A
new object is written before its canonical public URL is stored in the product.
If the product write fails, Turkiye deletes the just-created object. When a
successful update replaces a Turkiye-managed prior image, it deletes the prior
object only after the database update commits. A pre-existing external URL is
never deleted.

An infrequent failure between object creation and a database mutation can leave
an orphan. The existing Turkiye worker gains a daily catalog-media cleanup:
it lists `products/`, compares keys with managed URLs referenced by `products`,
and deletes only unreferenced objects older than 24 hours. It does not delete
objects outside that prefix or external URLs.

## Turkiye configuration and deployment

Turkiye adds these documented environment variables:

```text
MINIO_ENDPOINT=http://minio:9000
MINIO_BUCKET=turkiye-catalog-media
MINIO_ACCESS_KEY=<application-write-list-delete-key>
MINIO_SECRET_KEY=<application-write-list-delete-secret>
MEDIA_PUBLIC_BASE_URL=https://turkeyplanners.com/media
```

`compose.prod.yml` adds `minio` and a one-shot `minio-init` service. The init
service creates the bucket, configures anonymous read for that bucket only and
creates or verifies the application policy. API and worker wait for that
initialisation before using media storage. Root credentials exist only in the
MinIO and init-service environment; application containers receive only the
application credentials.

The production reverse-proxy configuration is updated as part of deployment:
`/media/` is mapped to the sole bucket path on the internal MinIO service and
does not permit arbitrary upstream paths. The API's existing `/api/` routing
remains unchanged.

## UI behavior

The VV Admin product dialog provides an accessible file control labelled
`Фотография товара`, a local preview after selection, file name/size feedback,
and a clear action before saving. Saving is disabled only while the existing
request is in progress; client-side checks mirror the server's one-file,
format and 5 MiB limits but are not security controls. The dialog retains all
product fields and the selected file after a validation or remote error so the
user can correct and retry.

For an existing image, the dialog displays the current image URL as a preview
only, never as an editable URL input. Clearing the selected replacement leaves
the current image unchanged. Removing an already attached image is not added
in this release because the current product API has no intentional "remove
image" product action.

## Security, audit and error handling

- The existing VV Admin session guard and Turkiye static key plus trusted actor
  context remain mandatory for every upload.
- Multipart parser limits cover one file, file size and allowed parts; request
  errors return a safe 400 response without filesystem, MinIO or parser detail.
- Uploaded bytes are never served from a writable API directory or PostgreSQL.
  Public objects always have `image/webp`, generated names and no user-supplied
  `Content-Disposition` metadata.
- Turkiye's existing `product.created` and `product.updated` audit events mark
  the `imageUrl` field when generated. VV Admin's paired requested/outcome
  events record only `photoUploaded: true` and safe field names, never the
  original name, public image payload, file bytes or storage credentials.
- The existing connector behavior for timeout/network uncertainty remains:
  VV Admin records an unknown outcome and requires a refresh before a retry.

These controls follow the file-upload baseline of server-side authorization,
allowlisted actual content type, generated filenames, size limits and storage
separate from the web application.

## Verification and acceptance

### Automated

- Turkiye unit tests cover media key generation, managed-URL recognition,
  MIME/signature rejection, decode failure, size/dimension normalisation,
  rollback deletion and external-URL preservation.
- Turkiye Admin Catalog integration tests inject authenticated multipart create
  and update requests, assert the stored/public `imageUrl`, and prove that
  unauthenticated, malformed, oversized and multi-file requests do not write
  product rows or objects.
- VV Admin connector tests assert exact multipart forwarding, target path,
  actor/key headers, timeout/redirect behavior and secret-free errors. Its
  controller tests prove that an unauthenticated browser cannot upload.
- VV Admin UI/API-client tests cover selected-file preview, client validation,
  JSON fallback without a photo, multipart save with a photo and retained state
  after a failed remote mutation.
- Worker tests prove it deletes only old, unreferenced `products/` objects.

### Runtime

With controlled local credentials and both applications running, use the
browser to create a category and product with a JPEG/PNG/WebP fixture through
VV Admin, refresh the list, confirm the product response contains the canonical
`/media/products/...webp` URL, open that URL, and confirm the Turkiye public
catalog card and product page display it without console or network errors.
Repeat once with a replacement photo and confirm the visible URL changes.

No production deployment, real user notification, payment or live catalog
mutation is part of this design approval.

## Explicit non-goals

- Multiple product images or image galleries.
- Category/subcategory photo upload.
- Direct browser-to-MinIO uploads or browser-visible MinIO credentials.
- Manual product image URL editing in the VV Admin UI.
- A general-purpose file manager, arbitrary file upload, media deletion UI,
  CDN rollout, image search or asynchronous image moderation.
