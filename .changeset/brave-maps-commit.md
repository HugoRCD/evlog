---
'@evlog/cli': patch
---

fix: `evlog map --baseline git:<ref>` now tells a ref that does not resolve apart from a ref that is fine but has no committed `evlog.map.json`. The ratchet reads the map through git, so a map you gitignored is unreachable: instead of a generic "not found", the CLI says `no evlog.map.json in <ref>, and the ratchet needs a committed map` and names the fix (`evlog map && git add -f evlog.map.json`), while a nonexistent ref gets its own error (`no git ref <ref>`).
