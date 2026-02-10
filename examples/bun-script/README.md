# Plain TypeScript / Bun Example

Using evlog with drain adapters outside of Nitro — just a plain script.

```bash
# Set your Axiom credentials
export AXIOM_TOKEN="xaat-..."
export AXIOM_DATASET="my-logs"

bun run start
```

This example shows how to use `initLogger` with the `drain` option to automatically send every log to Axiom via the pipeline (batching + retry).
