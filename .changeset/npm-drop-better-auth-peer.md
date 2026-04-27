---
"evlog": patch
---

Remove `better-auth` from `peerDependencies`. Optional peers still led npm to resolve Better Auth’s peer graph (including `@sveltejs/kit` / Vite), causing `ERESOLVE` for apps that do not use Better Auth ([#299](https://github.com/HugoRCD/evlog/issues/299)). Users of `evlog/better-auth` should keep `better-auth` as a direct dependency (see docs).
