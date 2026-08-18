# Task E — Behavior-preserving refactor

Extract pricing calculation from `OrderService` into a focused
`src/pricing.mjs` module exporting `priceOrder(order, taxRate)`. Preserve the
existing `OrderService.quote(order)` API, validation behavior, rounding, and
returned object shape. Avoid unrelated cleanup or new public APIs. Add tests for
the extracted seam and run the complete characterization suite.
