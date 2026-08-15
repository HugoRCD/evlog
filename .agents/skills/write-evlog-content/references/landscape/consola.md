# consola

Checked: 2026-08-14 · Source: https://github.com/unjs/consola

consola is the logger evlog's own audience already has installed. Nuxt users meet it before they meet any logger they chose, so the comparison has to be about scope rather than quality.

## What it does

- Console logger for Node, the browser, and workers, from the same unjs ecosystem as Nitro and Nuxt.
- Reporters render output. The default is a formatted terminal reporter; a JSON reporter ships too. A custom reporter is an object with a `log(logObj, ctx)` method, so it owns delivery and can buffer, batch, or forward anywhere.
- `consola.withTag('name')` scopes output, `consola.wrapConsole()` captures `console.*`.
- Prompt helpers, spinners, and box output for CLI work.
- Log levels are numeric and settable globally.

## What evlog does differently

- The built-in reporters render each call as it arrives. evlog accumulates fields over a unit of work and emits one event at the end, including when the handler throws.
- No pipeline, no batching, no sampling, no drain adapters in the box. A custom reporter can do any of it, and then that policy is yours to write and maintain.
- No request lifecycle and no accumulated context.

## What we must never say

- That consola is unstructured. A JSON reporter exists.
- That a reporter can only write immediately. A custom reporter is a `log` method and can buffer or defer like anything else.
- That it is only for CLIs. It runs in Nitro and in the browser, and plenty of apps ship it in production.
- Anything that reads as a criticism of consola for not being a telemetry pipeline. It is not trying to be one, and the honest sentence is about where the reader's needs moved, not about what consola lacks.
