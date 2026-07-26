---
"@evlog/cli": patch
---

Point the `map` report at the new CLI documentation. The footer of the default report links to `/cli/scoring`, the matrix legend links to `/cli/rules`, and a failed `--min-score` gate links to `/cli/ci` — three pages that explain, respectively, how the score is calculated, what every column checks, and how to gate a pull request. A rule with no docs link of its own now falls back to the rules reference instead of a page that did not exist.
