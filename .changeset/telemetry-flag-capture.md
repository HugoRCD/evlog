---
"@evlog/telemetry": minor
---

Report the flags the user actually passed, instead of the parser's view of them.

Three kinds of parser noise are dropped before an event is built, so `flags` answers "what did they type?" rather than "what did citty fill in?":

- **Positionals** — citty's `_` bucket holds argument values, not flag names, and it was being reported as `_: true` on every run that took an argument
- **Defaults** — a flag still sitting at its declared `default` is not a choice anyone made. `withTelemetry()` now reads the command's `args` to recognise them, so `my-tool build` sends `{}` where it used to send every defaulted switch. Negation still reports: `--no-write` against `write: { default: true }` records `write: false`
- **Kebab-case duplicates** — `--min-score` arrives from the parser as both `minScore` and `min-score`. Only the camelCase name is kept, and that is the name `collect.flags` allowlists

A string flag whose value is not allowlisted now records the exported `FLAG_VALUE_SET` sentinel (`"<set>"`) rather than `true`. `--baseline main` and a genuine boolean switch are different facts about a run, and reporting both as `true` made a value-carrying option indistinguishable from a switch once the runs were aggregated. The value itself is still never sent.

`TelemetryHandle.run()` takes an optional `args` alongside `flags` for tools that call it directly; `withTelemetry()` passes it for you.
