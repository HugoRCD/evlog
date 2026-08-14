# winston

Checked: 2026-08-14 · Source: https://github.com/winstonjs/winston

The incumbent. A reader naming winston usually inherited it rather than chose it, which changes what the page owes them: a migration path, not an argument.

## What it does

- `winston.createLogger({ level, format, transports })`. Multiple transports on one logger, each with its own level.
- Formats compose through `logform`: `combine`, `timestamp`, `json`, `printf`, and custom formats.
- Transports ship for console, file, and HTTP, with a large third-party set (`winston-transport` is the base class).
- Profiling helpers (`logger.profile`), child loggers (`logger.child`), and exception and rejection handlers.
- Levels follow npm's by default, and custom level sets are supported.

## What evlog does differently

- winston's unit is the message with metadata attached. evlog's unit is the request, and the message is one field of it.
- Format composition happens per write. evlog shapes the event once, at emit.
- winston has no sampling and no per-drain retry policy. A user builds those into a custom transport.

## What we must never say

- That winston cannot do structured output. `format.json()` is core.
- That it is unmaintained. Check the repository before writing anything about its activity.
- Anything about its overhead without a number and a source, this file included. Overhead is the claim a reader checks first, and the published comparisons are pino's ([benchmarks](https://github.com/pinojs/pino/blob/main/docs/benchmarks.md)), which name their setup. Reproduce one against the versions you are writing about, cite what you ran, or leave the subject alone.
