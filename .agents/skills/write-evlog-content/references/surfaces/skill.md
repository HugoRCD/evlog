# Surface: skills

Two sets, and they are not the same product.

- `.agents/skills/` is internal. It is loaded by agents working in this repository, and it can assume the checkout, the commands, and the conventions.
- `apps/docs/skills/` is published, served from the docs site under `.well-known/skills`. It is loaded by someone else's agent, in someone else's repository, against evlog as a dependency.

A skill written for one and moved to the other is wrong in both directions: the internal one leaks repo paths, the published one is vague about a codebase it should know.

## What it owes its reader

Its reader is a model with a task in progress and a budget. It owes, in this order:

1. A `description` that fires in the right situation and stays quiet otherwise.
2. The procedure, in the order it is executed, with the command as the command.
3. The bounds: what this never does, and what goes back to a person.

Nothing else. Rationale earns its place only where a step looks wrong without it and an agent would helpfully skip it.

## Rules that bite here

- **M-06** decides whether the file is ever loaded. A skill nobody loads is not a documentation problem, it is a dead file.
- **M-03** and **M-07** decide whether it is trusted once loaded. Verify every path against the checkout in the same pass.
- **M-09** decides who may change it. Voice fixes yes, procedure changes no.
- **U-15** applies with force: a skill teaching an agent the wrong word for a drain produces PRs using the wrong word.

## What a content pass checks

- Does the repository still have the layout the skill describes? `AGENTS.md` lists the internal skills and their subjects; a skill covering an adapter, an enricher, or an integration that changed shape is stale by definition.
- Do the published skills still match the package's public API? They are read against `evlog` as a dependency, so an entry point rename breaks them silently.
- Do the two sets contradict each other? Same subject, two procedures, is a finding against both.
