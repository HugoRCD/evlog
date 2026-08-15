---
title: Send events to Axiom
description: Wire the Axiom drain, pick what it batches, and know what it costs.
---

# Send events to Axiom

Your handler already emits one wide event per request. Until a drain is wired, that event dies with the process, which is fine in development and useless the moment you deploy.

## Wire the drain

```ts [server/plugins/evlog.ts]
import { createAxiomDrain } from 'evlog/axiom'

export default createAxiomDrain({
  token: process.env.AXIOM_TOKEN,
  dataset: 'requests',
})
```

The drain holds events in memory and flushes on a 2-second timer or at 100 events, whichever comes first. Flushing runs outside the response, so a slow Axiom never shows up in your p99.

## What it costs

Three things change when you turn this on.

A failed flush retries 3 times with backoff, then drops the batch and logs one line locally. Events are not persisted between retries, so a process that exits mid-flush loses what it was holding.

The token is read once at boot. Rotating it needs a restart.

Every field you accumulate is a field Axiom indexes, and Axiom bills on ingested bytes. A `request.headers` dump is the usual way a bill triples.

## Check it arrives

```bash
pnpm evlog tail --drain axiom
```

The CLI reads the same config and prints what the drain would send. If the dataset name is wrong you see it here rather than in an empty Axiom view an hour later.
