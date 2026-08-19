---
"evlog": minor
---

The `evlog/eve` wide event now records which AI provider (deployment) served each turn. The `ai.model` field continues to carry the gateway slug (e.g. `deepseek/deepseek-v4-flash`), while the new `ai.provider` field reports the resolved provider (e.g. `deepseek`), extracted from the model id eve reports on `session.started`. Cost-per-provider analysis no longer requires cross-referencing the rate card against the model catalogue.
