---
"evlog": patch
---

test: cover `evlog/orpc` and `evlog/next` with the shared middleware conformance matrix — both already behaved correctly, but nothing pinned it, and that same matrix is what caught `evlog/workers` honouring only `cf-ray` for the request id and `evlog/next` accepting `plugins` without ever applying them. The checks move into one runner-agnostic module with the Vitest helper reduced to a binding over it, so there is a single copy rather than two that can drift, and two checks are added: an `exclude`d route is skipped but still served, and `enrich` runs before `drain` with the response status.
