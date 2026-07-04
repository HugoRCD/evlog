---
"evlog": patch
---

Fix stream server mis-detection when co-located with eve dev: return 404 (not SSE 200) for non-root GET paths, and re-bind the turn logger on `actions.requested` so tool handlers can resolve `useLogger()`.
