---
"evlog": patch
---

Resolve Nitro runtime config in drain adapters via dynamic `import()` (Cloudflare Workers and other runtimes without `require`). Cache Nitro module namespaces after first load to avoid repeated imports on every drain. Fix HyperDX drain to `await` `resolveAdapterConfig()` so env/runtime config is applied when using `createHyperDXDrain()` without inline overrides.
