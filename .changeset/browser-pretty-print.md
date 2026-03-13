---
"evlog": patch
---

Fix browser DevTools pretty printing to use CSS `%c` formatting instead of ANSI escape codes (fixes Firefox rendering), share CSS color constants between standalone and client loggers, and escape `%` in dynamic values to prevent format string injection
