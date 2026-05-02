# Dependency patches (pnpm)

## `vaul-vue@0.4.1`

`vaul-vue` lists `vue` as a **dependency**, so installers nest a second copy under `vaul-vue/node_modules/vue`. That breaks Nuxt SSR (duplicate Vue runtime, `renderSlot` / `.ce`).

The patch removes `vue` from `dependencies` (it stays in `peerDependencies`). The last remaining dependency line must **not** end with a trailing comma — `package.json` must stay strict JSON (Vite's commonjs resolver parses it). Tracked via `pnpm.patchedDependencies` in the root `package.json`. See [pnpm patch](https://pnpm.io/cli/patch).

`apps/docs` may pin **`vaul-vue`** to the same version as `@nuxt/ui` so the monorepo resolves the package reliably; the pnpm patch is what fixes duplicate Vue (no Nuxt `alias` / Vite workarounds needed).

When upgrading `vaul-vue`, refresh or drop this patch if upstream fixes the manifest.
