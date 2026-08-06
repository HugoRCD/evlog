# @evlog/eve

evlog packaged as an eve extension. Consumers mount it under
`agent/extensions/` instead of writing `agent/hooks/evlog.ts` by hand.

## This package does not build like the others

It builds with `eve extension build`, not tsdown, and the output tree
(`dist/extension`) is agent-shaped rather than a bundle. `eve extension build`
requires **Node >= 24**.

`prepare` and `dev:prepare` are deliberately absent. The release script already
runs `turbo run build --filter='./packages/*'` before `changeset publish`, so
the dist exists when it matters. Wiring the build into `dev:prepare` would put
it on the critical path of `lint`, `typecheck` and `test`, which then fail for
anyone on Node 22 — nothing in this repo consumes this package's dist.

## Config cannot carry functions

The mount config is a Standard Schema, validated synchronously, so `drain`,
`enrich` and `keep` cannot cross the mount boundary. Everything consumers
configure has to be declarative — an adapter name, a sampling rate, redaction
paths. Agents that genuinely need a callback use `defineEvlogHook` from
`evlog/eve` directly; keep that escape hatch documented.

## Layout

- `extension/extension.ts` — the config schema, and the handle contributions read
- `extension/lib/` — shared code: adapter resolution, config → hook options
- `extension/hooks/` — the wide-event hook
- `extension/tools/` — `annotate`, mounted as `<namespace>__annotate`
- `extension/skills/` — procedures taught to the host agent

Tool, skill and connection names come from file paths and the consumer's mount
adds the namespace prefix, so name the file `annotate`, never `evlog_annotate`.
