# consola

Checked: 2026-08-14 · Source: https://github.com/unjs/consola

consola is the logger evlog's own audience already has installed. Nuxt users meet it before they meet any logger they chose, so the comparison has to be about scope rather than quality.

## What it does

- Console logger for Node, the browser, and workers, from the same unjs ecosystem as Nitro and Nuxt.
- Reporters render output. Three ship: `fancy`, `basic`, and `browser`. There is no JSON reporter in the box; structured output is a custom reporter.
- A custom reporter is an object with a `log(logObj, ctx)` method, so it owns delivery and can serialize, buffer, batch, or forward anywhere.
- `consola.withTag('name')` scopes output, `consola.wrapConsole()` captures `console.*`.
- Prompt helpers, spinners, and box output for CLI work.
- Log levels are numeric and settable globally.

## What evlog does differently

- consola's built-in reporters render each call as it arrives. evlog accumulates fields over a unit of work and emits one event at the end, including when the handler throws.
- consola ships no pipeline, no batching, no sampling, and no drain adapters. evlog ships all four, and a custom consola reporter is where you would write them yourself.
- consola has no request lifecycle and no accumulated context. That is the difference the reader feels first.

## What we must never say

- That consola cannot do structured output. It ships no JSON reporter, and a custom reporter gets there in a few lines. The honest sentence is about what is in the box, not about what is possible.
- That a reporter can only write immediately. A custom reporter is a `log` method and can buffer or defer like anything else.
- That it is only for CLIs. It runs in Nitro and in the browser, and plenty of apps ship it in production.
- Anything that reads as a criticism of consola for not being a telemetry pipeline. It is not trying to be one, and the honest sentence is about where the reader's needs moved, not about what consola lacks.
