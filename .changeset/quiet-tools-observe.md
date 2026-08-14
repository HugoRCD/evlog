---
"evlog": minor
---

The `evlog/eve` integration now records how much context each tool result added. `ai.tools[]` gains an `inputTokens` field per tool, measured as the input-token delta between the step that called the tool and the step that consumed its result, so the tool that dominates a turn's context shows up without a manual before/after diff. Parallel tool results in one step share the delta evenly; a result whose delta crosses a compaction or context reset is left unset rather than mis-attributed.
