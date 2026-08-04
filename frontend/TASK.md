# Current development baseline

The old visual-only phases are completed historical work. The next implementation must follow the root [AGENTS.md](../AGENTS.md), [product rules](../docs/product/business-rules.md), [architecture](../docs/architecture/overview.md) and [agent pipeline](../docs/development/agent-pipeline.md).

The first production implementation plan has not yet been approved. Before code changes, an agent must prepare a vertical-slice plan that states the owned files, backend/API contract, tests, migration impact and browser verification. The likely dependency order is backend foundations → auth/catalog/admin contract → order/payment/webhook/outbox → frontend API flows → visual migration.

Do not revive the former “homepage only / no backend / local checkout” scope.
