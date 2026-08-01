---
"evlog": minor
---

fix(core): key request scope, logger config and error identity to a versioned `globalThis` registry — evlog declares 18 optional peers, and pnpm/bun (isolated linker) hash resolved peers into store paths, so two workspaces that resolve `ai` or `zod` differently end up with physically distinct copies of the *same* evlog version. Each copy used to carry its own `AsyncLocalStorage` (so `useLogger()` threw inside another copy's `withEvlog()`), its own logger configuration (so events emitted through the second copy were silently undrained and unredacted), and its own `EvlogError` class (so `instanceof` downgraded structured errors to bare 500s). All three are now shared per major version. `createLoggerStorage()` takes an optional storage id, and `EvlogError.isEvlogError()` replaces `instanceof` for cross-copy checks
