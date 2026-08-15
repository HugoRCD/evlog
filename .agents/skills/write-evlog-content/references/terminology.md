# Terminology

The names evlog gave its own parts. Using someone else's word for one of them costs the reader twice: they learn a term the API does not use, then fail to find it in the docs.

Rule id: `U-15`. The scanner raises a candidate from `scripts/content-lint/lib/corpus.mjs`, which holds the same table.

| evlog says | Not | Why |
| --- | --- | --- |
| **drain** | sink, transport, exporter | A drain is where events leave the process. `transport` is pino's word, `exporter` is OpenTelemetry's, and both carry the other tool's model with them. |
| **enricher** | enrichment plugin, context provider, middleware | An enricher adds fields to an event before it is emitted. Calling it middleware puts it in the request chain, which is where it is not. |
| **error catalog** | error registry, error map, error dictionary | `defineErrorCatalog` is the API. Anything else is a term the reader cannot grep for. |
| **`log.fork()`** | child logger, sub-logger | pino's `child()` inherits bindings. `fork()` branches accumulated context and can be discarded. The distinction is the feature. |
| **wide event** | wide log, fat event, structured log | One event per unit of work, with every field the work touched. `structured log` is the category, not this. |
| **pipeline** | chain, middleware stack | `createDrainPipeline` composes drains. |
| **evlog/toolkit** | evlog/shared | `evlog/shared` is not an entry point. `T-15`, always critical. |
| **evlog/http** | evlog/browser | Deprecated entry point. `T-15`. |

## The twin

A sentence describing another tool uses that tool's vocabulary, and has to. "pino writes through a transport that runs in a worker thread" is correct and the scanner drops it: the check skips any sentence naming an alternative.

What survives is a sentence about evlog wearing another tool's word. "Register the sink" is the finding, whatever page it lands on.

## When the word is genuinely missing

Sometimes the reader's word has no evlog equivalent and the page needs a bridge. Write the bridge once, in the reader's word, then use evlog's:

> A drain is where events leave the process. If you come from pino, it sits where a transport sat.

One bridge per page. A page that keeps translating never taught the term.
