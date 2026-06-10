---
"evlog": minor
---

Add glob path redaction to `RedactConfig.paths`. Single-segment patterns like `password` are shorthand for `**.password` (any nesting depth). Key-name globs (`*_token`) and path globs (`user.*`) are supported. `auditRedactPreset` simplified to path globs.

```ts
initLogger({
  redact: {
    paths: ['password', '*_token', 'headers.x-forwarded-for'],
  },
})
```
