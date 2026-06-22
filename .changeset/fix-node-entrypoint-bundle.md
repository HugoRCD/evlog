---
"evlog": patch
---

# fix: keep Node built-ins out of the main entrypoint bundle

Non-Node bundlers (Convex, etc.) failed when importing `defineErrorCatalog` from `evlog` because the main bundle transitively referenced `node:crypto` and `pretty-error-snippet.node` (`node:fs`, `node:path`, `node:module`). The audit signer now uses `globalThis.crypto.subtle` only, disk snippet loading is registered from Node-only integration entrypoints instead of `initLogger`, and catalog utilities live in a dedicated `evlog/catalog` subpath backed by a lean `audit-action` module.

Closes #387
