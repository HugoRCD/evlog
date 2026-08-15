# consola

Checked: 2026-08-14 · Source: https://github.com/unjs/consola

consola is the logger evlog's own audience already has installed. Nuxt users meet it before they meet any logger they chose, so the comparison has to be about scope rather than quality.

## What it does

- Console logger for Node, the browser, and workers, from the same unjs ecosystem as Nitro and Nuxt.
- Reporters render output. Three ship: `fancy`, `basic`, and `browser`. There is no JSON reporter in the box; structured output is a custom reporter.
- A custom reporter is an object with a `log(logObj, ctx)` method, so it owns delivery and can serialize, buffer, batch, or forward anywhere.
- `consola.withTag('name')` scopes output, `consola.wrapConsole()` captures `console.*`.
- Delivery is not unconditional. `pauseLogs()` queues calls until `resumeLogs()` drains them, and a repeated identical log is throttled rather than repeated.
- Prompt helpers, spinners, and box output for CLI work.
- Log levels are numeric and settable globally.

## What evlog does differently

- consola's unit is the call. A call reaches its reporters when logging is running, waits in the queue while `pauseLogs()` holds it, or is dropped as a repeat. evlog's unit is the work: it accumulates fields over a request or a job and emits one event when that ends, including when the handler throws.
- consola's queueing is a pause switch, not a policy. evlog ships batching, sampling, retry, and drain adapters, and picking between them is configuration. In consola that is a custom reporter you write and maintain.
- consola has no request lifecycle and no accumulated context. That is the difference the reader feels first.

## What we must never say

- That consola cannot do structured output. It ships no JSON reporter, and a custom reporter gets there in a few lines. The honest sentence is about what is in the box, not about what is possible.
- That consola always writes immediately. `pauseLogs()` queues, repeats are throttled, and a custom reporter owns delivery entirely. Name the mechanism or leave delivery out of the sentence.
- That it is only for CLIs. It runs in Nitro and in the browser, and plenty of apps ship it in production.
- Anything that reads as a criticism of consola for not being a telemetry pipeline. It is not trying to be one, and the honest sentence is about where the reader's needs moved, not about what consola lacks.
