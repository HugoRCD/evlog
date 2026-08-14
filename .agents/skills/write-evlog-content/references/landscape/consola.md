# consola

Checked: 2026-08-14 · Source: https://github.com/unjs/consola

The one evlog's own audience already has installed. Nuxt users meet consola before they meet any logger they chose, so the comparison has to be about scope rather than quality.

## What it does

- Console logger for Node, the browser, and workers, from the same unjs ecosystem as Nitro and Nuxt.
- Reporters render output. The default is a formatted terminal reporter; a JSON reporter and custom reporters are supported.
- `consola.withTag('name')` scopes output, `consola.wrapConsole()` captures `console.*`.
- Prompt helpers, spinners, and box output for CLI work.
- Log levels are numeric and settable globally.

## What evlog does differently

- consola renders for a human at a terminal. evlog serializes for a query engine.
- No pipeline, no batching, no sampling, no drain adapters. Reporters write, they do not retry or drop.
- No request lifecycle and no accumulated context.

## What we must never say

- That consola is unstructured. A JSON reporter exists.
- That it is only for CLIs. It runs in Nitro and in the browser, and plenty of apps ship it in production.
- Anything that reads as a criticism of consola for not being a telemetry pipeline. It is not trying to be one, and the honest sentence is about where the reader's needs moved, not about what consola lacks.
