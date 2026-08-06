---
name: observability
description: Record business context on the current turn's observability event. Use when the agent has looked up an entity, made a decision, or moved an amount, and that fact should be queryable later.
---

# Annotating a turn

Each turn produces one wide event: an entry carrying token usage, tool calls,
durations and outcome. What it cannot know is your business context — which
customer, which order, which decision. That is what `annotate` adds.

## When to annotate

Annotate once you hold a fact that someone would later filter on:

- an entity you resolved — `customer`, `order`, `invoice`, `ticket`
- a decision you took and why — `refund` with its amount and reason
- an outcome that is not an error but matters — a fallback you used, a limit
  you hit

Annotate as soon as you know the fact. A turn that fails after the annotation
still carries it, which is exactly when it is most useful.

## When not to annotate

- **Never** user message content, credentials, tokens, or personal data such as
  emails, phone numbers, or addresses. The event leaves the agent.
- Not tool inputs and outputs, token counts, durations, or errors — those are
  already recorded automatically.
- Not free-form prose. One `annotate` call with a flat object beats three calls
  with a sentence each.

## Shape

`key` is a lowercase field name; `value` is a flat object of strings, numbers or
booleans.

```
annotate({ key: "order", value: { id: "4821", total: 89.9, expedited: true } })
annotate({ key: "refund", value: { amount: 89.9, reason: "damaged_on_arrival" } })
```

Prefer one key per domain entity. Re-annotating the same key replaces its
previous value, so record the final state rather than each intermediate step.
