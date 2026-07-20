---
"evlog": patch
---

Export `evlog/package.json` so tooling (e.g. `evlog doctor`) can resolve the installed version via `require.resolve('evlog/package.json')` under Node's `exports` map.
