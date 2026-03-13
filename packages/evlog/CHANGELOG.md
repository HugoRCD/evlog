# evlog

## 2.6.0

### Minor Changes

- [#169](https://github.com/HugoRCD/evlog/pull/169) [`e38787f`](https://github.com/HugoRCD/evlog/commit/e38787f08ea63bbff4ba2fea10945b2f9af94ef5) Thanks [@OskarLebuda](https://github.com/OskarLebuda)! - Add `evlog/toolkit` entrypoint exposing building blocks for custom framework integrations (`createMiddlewareLogger`, `extractSafeHeaders`, `createLoggerStorage`, `extractErrorStatus`)

### Patch Changes

- [#164](https://github.com/HugoRCD/evlog/pull/164) [`d84b032`](https://github.com/HugoRCD/evlog/commit/d84b03277d20cce649e4711db2e6bedbafd3f0f4) Thanks [@oritwoen](https://github.com/oritwoen)! - Fix browser DevTools pretty printing to use CSS `%c` formatting instead of ANSI escape codes (fixes Firefox rendering), share CSS color constants between standalone and client loggers, and escape `%` in dynamic values to prevent format string injection

- [#166](https://github.com/HugoRCD/evlog/pull/166) [`5f45b3f`](https://github.com/HugoRCD/evlog/commit/5f45b3ff01d2f73dbd92de14e384608541002bd3) Thanks [@schplitt](https://github.com/schplitt)! - Fix Nitro v3 error handler registration and update to Nitro v3 beta

## 2.5.0

### Minor Changes

- [`d7b06fa`](https://github.com/HugoRCD/evlog/commit/d7b06faba5704aa97fe1b9a46628be974a1b8a37) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add default condition to subpath exports for CJS compatibility and fix OTLP batch grouping by resource identity

## 2.4.1

### Patch Changes

- [`8ade245`](https://github.com/HugoRCD/evlog/commit/8ade2455ecc8f8da37e71fe19b7302dfb1563d69) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Restore useLogger() JSDoc for IntelliSense and remove unused RequestLogger import from Fastify adapter

## 2.4.0

### Minor Changes

- [#141](https://github.com/HugoRCD/evlog/pull/141) [`91f8ceb`](https://github.com/HugoRCD/evlog/commit/91f8cebe3d00efcd1b9fc8795b2b272a17b8258d) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add NestJS integration (`evlog/nestjs`) with Express-compatible middleware, `useLogger()` via AsyncLocalStorage, and full pipeline support (drain, enrich, keep)

- [#142](https://github.com/HugoRCD/evlog/pull/142) [`866b286`](https://github.com/HugoRCD/evlog/commit/866b28687cd9cae2dfe347c5831a3c62648906ef) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add SvelteKit integration (`evlog/sveltekit`) with handle hook, error handler, `useLogger()`, and `createEvlogHooks()` for automatic wide-event logging, drain, enrich, and tail sampling support

## 2.3.0

### Minor Changes

- [#135](https://github.com/HugoRCD/evlog/pull/135) [`e3e53a2`](https://github.com/HugoRCD/evlog/commit/e3e53a2dac958e0ede9dffb70623f90ff800c0bc) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add Elysia plugin integration (`evlog/elysia`) with automatic wide-event logging, drain, enrich, and tail sampling support

## 2.2.0

### Minor Changes

- [#134](https://github.com/HugoRCD/evlog/pull/134) [`2f92513`](https://github.com/HugoRCD/evlog/commit/2f9251346384eef42cc209919ae367aee6054845) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add Express middleware integration (`evlog/express`) with automatic wide-event logging, drain, enrich, and tail sampling support

- [#132](https://github.com/HugoRCD/evlog/pull/132) [`e8d68ac`](https://github.com/HugoRCD/evlog/commit/e8d68acf7e6ef44ad4ee44aff2decc4a4885d73f) Thanks [@HugoRCD](https://github.com/HugoRCD)! - Add Hono middleware integration (`evlog/hono`) for automatic wide-event logging in Hono applications, with support for `drain`, `enrich`, and `keep` callbacks

## 2.1.0

### Minor Changes

- [`f6cba9b`](https://github.com/HugoRCD/evlog/commit/f6cba9b39a84e88ae44eef8ea167e6baa3a43e51) Thanks [@HugoRCD](https://github.com/HugoRCD)! - bump version
