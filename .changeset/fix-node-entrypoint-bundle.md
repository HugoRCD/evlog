---
"evlog": patch
---

fix: keep Node built-ins out of the main entrypoint bundle

Non-Node bundlers (Convex, etc.) failed when importing `defineErrorCatalog` from `evlog` because the main bundle transitively referenced `node:crypto` and `pretty-error-snippet.node` (`node:fs`, `node:path`, `node:module`). The audit signer now uses `globalThis.crypto.subtle` only, disk snippet loading is registered from Node-only integration entrypoints instead of `initLogger`, and catalog utilities are available via a dedicated `evlog/catalog` subpath with a lean dependency graph.

Closes #387
