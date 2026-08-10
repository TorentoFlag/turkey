# Online Ruble Payment Label Design

## Goal

Replace the customer-facing provider name in the product-card metadata with a
neutral Russian payment label for payable products.

## Scope and decision

On `services/[slug]`, `auto_delivery` and `physical` products display
`Оплата онлайн рублями` under `Оформление`. `booking` keeps its existing
`Заявка без оплаты на сайте` text.

This is a presentation-only change. Arc Pay remains the backend checkout
provider for payable products; its redirect, webhook verification, refund
handling, API contracts, configuration, order state and legal texts are not
changed.

## Verification

Add a narrow source-level regression check for both branches of the label,
then run frontend lint, typecheck and build. After deployment, check a payable
product through the public site/API and its health endpoint.
