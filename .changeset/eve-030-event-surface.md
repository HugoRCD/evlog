---
"evlog": minor
---

Cover the eve 0.30 event surface. **Requires eve >= 0.30** — the peer range moves from `>=0.24.3`.

The wide event now carries what eve started reporting since 0.24:

- `eve.runtime` — eve version, agent id, model, and the deployed git sha, branch and date, from `session.started`
- `eve.parent` — parent and root session ids for a subagent run, so a drain can rebuild the delegation tree
- `eve.authorizations` — connection sign-ins with their outcome, reason and duration; a turn parked on one ends as `eve.phase: 'awaiting-authorization'`
- `eve.compaction` — how many compactions ran, on which model, and how full the context was when the first one triggered
- `eve.contextCleared`, `eve.stepFailures` and `eve.failedSteps` — a model call that failed and was retried no longer disappears from a turn that ends up succeeding
- `ai.costUsd` — the cost eve reports, used in place of the `cost` pricing map when available. `ai.model` falls back to the model reported at session start, so `model` is only needed for dynamic-model agents
- subagents record `durationMs` and a `started` status

`message` replaces `redactMessage` with three modes: `'omit'` (default), `'preview'` (text truncated to `messagePreviewLength`, attachments reduced to their type) and `'full'`. Attachment parts were previously not redacted at all. `redactMessage` still works and is deprecated.

`sessionEvent: true` adds one wide event per session on top of the per-turn ones, rolling up turns, tokens, cost, tools used, compactions and authorizations — one row per conversation, which is what makes tail sampling useful on an agent.
