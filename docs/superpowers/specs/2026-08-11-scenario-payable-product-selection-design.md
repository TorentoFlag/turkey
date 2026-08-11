# Scenario payable product selection

## Goal

Make the VV Admin checkout scenario create an Arc checkout whenever the catalog
contains at least one active payable product, even when active `booking` items
were created first.

## Decision

`OrdersService.createScenarioOrder` will select a product in the database using
all payment preconditions: active status, type `auto_delivery` or `physical`,
non-null price and currency, and an Arc-supported currency (`RUB`, `KZT`, or
`UZS`). `booking` remains excluded because product rules forbid creating a
checkout for it.

## Scope and failure handling

The change affects only the internal `POST /v1/admin/scenario-orders` path
called by the VV Admin worker. It does not change customer checkout, product
types, payments, or existing orders. If no product meets the conditions, the
existing `400 No payable active product for scenario` response remains.

## Verification

An integration test creates booking records before a payable product, invokes
the scenario endpoint, and proves that it returns checkout data and creates a
non-booking scenario order. Existing backend checks then cover build and types.
