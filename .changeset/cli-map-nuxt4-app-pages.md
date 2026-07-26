---
"@evlog/cli": patch
---

fix(cli): detect Nuxt 4 `app/pages` (and `src/pages`) in `evlog map` — pages under the Nuxt 4 default layout were invisible, which could leave a project at 100/100 with zero entry points
