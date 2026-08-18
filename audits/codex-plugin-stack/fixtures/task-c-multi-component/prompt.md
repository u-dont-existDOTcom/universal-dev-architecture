# Task C — Multi-component feature

Add minimum-severity filtering to the event report pipeline. The configuration
loader, selector, and renderer are separate stable components.

Requirements:

- Supported severities, in order, are `info`, `warning`, and `error`.
- Default minimum severity remains `info`.
- `loadConfig` rejects an unsupported configured severity.
- Selection excludes events below the configured threshold without reordering.
- Rendering and the existing public `buildReport(events, rawConfig)` entry point
  remain backward compatible.

Implement, integrate, test, and verify the feature. Parallelize only if it
actually reduces work and finish with integrated verification.
