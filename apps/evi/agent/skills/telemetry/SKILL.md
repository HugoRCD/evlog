---
name: telemetry
description: Answer questions about how the evlog CLI is used in production and surface interesting findings from the telemetry dashboard's MCP. Load this when asked about CLI usage, telemetry, adoption, flags, or "what's happening in the CLI", and when the digest needs its CLI usage section.
---

# Telemetry

Read-only production telemetry for the evlog CLI and anything else reporting through `@evlog/telemetry`, served by the telemetry app's MCP (`telemetry__*` tools). Ground every answer in the tools; never guess usage from memory.

## The tools

- `telemetry-stats`: aggregate for a range (24h/7d/30d) with the preceding equal window for comparison, breakdowns by environment, tool, source, Node major, tool version and OS, top commands, top error codes, duration percentiles, activity timeline.
- `telemetry-adoption`: version rollout over time, new vs returning machines, weekday/hour punchcard, flag/custom-field breakdown.
- `telemetry-runs`: the raw event list, filterable and sortable, with pagination.
- `telemetry-run`: everything recorded for one run by id (flags, custom fields, environment).

## What is interesting

- **Version adoption**: are users moving to newer CLI versions? A release stalling in adoption is a signal that the upgrade path hurts.
- **Source mix**: terminal vs CI vs agents vs automation. A shift here changes what the numbers mean.
- **Flags and custom fields**: what people actually enable. A flag nobody uses may deserve deprecation; a custom field spreading suggests a workflow worth documenting.
- **Errors**: top error codes and their trend. A code climbing week over week is an incident lead, not a footnote.
- **Period-over-period shifts**: `telemetry-stats` returns the previous equal window; lean on it before calling anything a change.

## Form

- Prefer `range: '7d'` for stable signals, `'30d'` for adoption questions, `'24h'` only when asked about today.
- Answer with numbers and a one-line interpretation. Cite the window. When the data is flat or empty, say so in one line instead of stretching it.
- The dashboard serves generated sample data until real events land; treat unusually clean numbers as suspect on a fresh deployment.
