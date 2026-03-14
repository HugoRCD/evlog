---
"evlog": patch
---

Remove `@sveltejs/kit` optional peer dependency that caused `ERESOLVE` failures in non-SvelteKit projects (e.g. Nuxt 4) due to transitive `vite@^8.0.0` requirement
