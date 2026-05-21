---
'evlog': patch
---

Fix `evlog/nitro` and `evlog/nitro/v3` on Windows. The module passed native `path.resolve()` paths to `nitro.options.plugins` and `nitro.options.errorHandler`. Nitro raw-interpolates those into the `#nitro/virtual/plugins` and `#nitro/virtual/error-handler` JS string literals, so Windows backslashes were parsed as escape sequences (`\n`, `\v`, …) and broke module resolution — surfacing as `Cannot find module … imported from '#nitro/virtual/error-handler'`. Paths are now normalized to forward slashes before being handed to Nitro.

Closes [#345](https://github.com/HugoRCD/evlog/issues/345).
