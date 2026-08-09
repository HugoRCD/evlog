---
'@evlog/cli': patch
---

fix: `evlog doctor` treats a wired fs drain as a local sink before the first event, and no longer warns when no local sink is configured
