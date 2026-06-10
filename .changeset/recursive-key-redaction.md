---
"evlog": minor
---

Add recursive key-based redaction to `RedactConfig`. Use `keys` to redact object property names at any nesting depth (e.g. `password` covers `user.password` and `data.a.b.password`), and `keyPatterns` for regex on key names. `auditRedactPreset` now uses `keys` instead of explicit dot-notation paths.

```ts
initLogger({
  redact: {
    keys: ['password', 'apiKey', 'authorization'],
    keyPatterns: [/.*_token$/i],
  },
})
```
