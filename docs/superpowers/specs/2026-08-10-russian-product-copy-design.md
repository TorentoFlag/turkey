# Russian Product Copy Design

## Goal

Make every customer-facing product title Russian while preserving brands,
trademarks, technical codes, prices, categories, product types, images and
descriptions.

## Current audit

The protected Admin API currently returns 94 products: the approved
93-product design catalog and one pre-existing test product. All descriptions
are Russian. Two approved product titles are fully English and require a
translation:

| Slug | Current title | Approved Russian title |
| --- | --- | --- |
| `rhythm-dance-show` | `Rhythm Dance Show` | `Танцевальное шоу Rhythm` |
| `zippline-nakkastepe` | `Zippline Nakkastepe Adventure` | `Зиплайн над Наккатепе` |

Mixed-language titles are not defects when Latin text is a brand,
product name, airport code or technical term. Examples that stay unchanged:
`eSIM`, `IST`, `VIP`, `Istanbul City Card`, `Turkishopping`, and `Golden Eye
Jewellery`.

## Chosen approach

Use a versioned, one-shot content migration that calls only the protected
Turkey Admin API. It is preferable to database writes or editing through the
browser because it uses the established trusted actor/audit boundary and can
reject unexpected catalog drift before it mutates anything.

The migration has a fixed manifest of the two approved slugs and expected
current titles. It first reads all products and verifies that both records
exist and exactly match the expected English titles. It then sends two serial
`PATCH /v1/admin/products/:id` calls, each with only `title`; it never sends a
photo or any other product field.

## Safety and failure behaviour

- Dry-run is the default and reports only aggregate counts and slugs.
- `--apply` is required for a mutation.
- A missing slug or a changed current title stops the process before any
  update; this prevents overwriting a concurrent editorial change.
- Updates run serially and stop on the first non-success response.
- The trusted actor is `catalog-copy-translation-2026-08-10`, so Turkey writes
  the normal `product.updated` audit records.
- No database, MinIO, category, order or deployment operation occurs.

## Verification

1. Unit-test the manifest, dry-run behaviour, drift rejection, exact two PATCH
   requests and no-photo/no-unrelated-field contract.
2. Run the script dry-run against production through the internal Docker
   network and confirm two planned updates and no drift.
3. Run the explicit `--apply` command once.
4. Re-read the Admin API: both titles match the Russian values; all other
   product fields are unchanged.
5. Verify the two product cards/pages on `turkeyplanners.com` in a browser and
   confirm the API health endpoint remains healthy.
