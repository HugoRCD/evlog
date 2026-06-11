---
"evlog": patch
---

Split Next.js instrumentation into an Edge-safe gate (`evlog/next/instrumentation`) and a Node-only factory (`evlog/next/instrumentation/create`) so root `instrumentation.ts` no longer pulls the logger, audit, or file-system helpers into the Edge bundle. `defineNodeInstrumentation` now accepts an options object directly (no `import().then()` in user code). Filter known Next.js Edge bundler warnings from `captureOutput` (`CaptureOutputOptions`: `stdout`, `stderr`, `ignore`). The FS adapter warns once and skips writes when `NEXT_RUNTIME` is `edge`.
