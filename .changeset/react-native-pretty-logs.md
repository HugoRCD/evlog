---
"evlog": patch
---

Detect browser environments for `%c` console styling using `isBrowser()` (window, document, and non–React Native `navigator.product`) so React Native / Metro no longer prints format strings and CSS arguments as literal text when `window` is polyfilled. `isClient()` / `isServer()` are unchanged for existing consumers.
