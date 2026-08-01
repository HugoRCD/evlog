---
"evlog": minor
---

Make emit-time redaction programmable

`RedactConfig.replacement` now accepts a function, so a replacement can be derived from the value it replaces instead of being a constant — a stable fingerprint keeps requests correlatable without exposing the credential:

```ts
initLogger({
  redact: {
    patterns: [/\/public\/claim\/([A-Za-z0-9._-]{12,})/g],
    replacement: (_match, ctx) => `/public/claim/[tok:${fingerprint(ctx.groups[0])}]`,
  },
})
```

`RedactConfig.transform` covers policies that cannot be expressed declaratively — conditional on a sibling field, tenant-scoped, or allowlist-shaped. It runs before the declarative stages, so it sees raw values and `paths` / `builtins` / `patterns` still apply to whatever it leaves behind.

Both run where redaction already runs: after the event is built, before the console write and before any drain. Failures are caught and reported like drain failures — a `replacement` function that throws falls back to `[REDACTED]` rather than emitting the raw value, and a throwing `transform` is skipped without stopping the event from being logged.

Function-valued policy cannot survive the build-time config bridges, which serialize to JSON; the Nitro modules now warn instead of dropping it silently.

Closes #463
