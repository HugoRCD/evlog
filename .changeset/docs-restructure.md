---
'evlog': patch
---

Documentation site restructured into 6 audience-driven categories: **Start → Learn → Integrate → Use Cases → Extend → Reference**. The npm-shipped `README.md` and a single JSDoc `@see` URL have been updated to point to the new locations.

Old documentation URLs continue to work via 301 redirects defined in `apps/docs/config/redirects.ts`. No public API changed.

If you bookmarked specific documentation pages, the most common moves are:

- `/getting-started/*` → `/start/*`
- `/logging/{simple-logging,wide-events,structured-errors}` → `/learn/*`
- `/logging/{ai-sdk,better-auth,audit,client-logging}/*` → `/use-cases/*`
- `/core-concepts/{lifecycle,sampling,typed-fields,redaction}` → `/learn/*`
- `/core-concepts/{configuration,performance,vite-plugin,best-practices}` → `/reference/*`
- `/frameworks/*` → `/integrate/frameworks/*`
- `/adapters/*` → `/integrate/adapters/*`
- `/build-on-top/*` → `/extend/*`
- `/enrichers/*` → `/use-cases/enrichers` or `/extend/custom-enrichers`
