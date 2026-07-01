---
"evlog": patch
---

# fix(nitro): avoid comment collision when inlining config with `*/` globs

Nitro's textual `nitro.options.replace` substitution was also rewriting JSDoc that mentioned the inline config token. Route globs containing `*/` (for example `/api/graphs/**/changes`) could terminate block comments early and break production builds with Rolldown parse errors.

Closes #397
