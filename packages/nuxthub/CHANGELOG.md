# @evlog/nuxthub

## 2.0.1

### Patch Changes

- [#376](https://github.com/HugoRCD/evlog/pull/376) [`4c13bb0`](https://github.com/HugoRCD/evlog/commit/4c13bb0043c5acca4bd8e99638740396a557ead0) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Hardening and performance improvements across the package:
  - **Redaction**: path matchers are now precompiled once per resolved config instead of on every event, and case-insensitive leaf lookups are O(1).
  - **Pipeline**: the idle flush scheduling timer is `unref()`'d so it never holds a Node process open on shutdown — call `flush()` to deliver buffered events before exit (unchanged, documented contract). Retry backoff timers stay ref'd so in-flight batches are not dropped mid-retry.
  - **Ingest endpoint**: request bodies are capped at 32KB (413 beyond) and parsed as strict JSON.
  - **Audit**: `stableStringify` guards against circular references in audit `changes` instead of recursing forever; shared (non-circular) references keep stable signatures.
  - **Toolkit**: new `applyDeprecatedAlias` helper to map deprecated config fields onto their replacement with a one-time warning, used by the Axiom and Better Stack adapters.
  - **Vite**: warns when `sourceLocation` is enabled for a production build (source paths embedded in the client bundle).
  - Published packages now declare `engines.node >= 18`.
