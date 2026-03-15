---
"evlog": minor
---

Add `evlog/vite` plugin for build-time DX enhancements in any Vite-based framework.

- Zero-config auto-initialization via Vite `define` (no `initLogger()` needed)
- Build-time `log.debug()` stripping in production builds (default)
- Source location injection (`__source: 'file:line'`) for object-form log calls
- Opt-in auto-imports for `log`, `createEvlogError`, `parseError`
- Client-side logger injection via `transformIndexHtml`
- New `evlog/client` public entrypoint
- Nuxt module gains `strip` and `sourceLocation` options (no breaking changes)
