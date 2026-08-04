# Frontend plan status

The preceding numbered Floema homepage phases are historical prototype work and no longer direct implementation instructions.

Current plan source:

1. [Product rules](../docs/product/business-rules.md).
2. [Target architecture](../docs/architecture/overview.md).
3. [Agent development pipeline](../docs/development/agent-pipeline.md).
4. A task-specific implementation plan prepared and approved before any production slice.

Frontend migration must be incremental. Preserve visual components where useful, but replace mock/localStorage/cart/card UI only after backend contracts exist and are verified. The required user flows are product-type driven, not a generic multi-item checkout.
