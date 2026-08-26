# Iteration workflow (GitHub Projects)

Preferences for agents working this repo against the **Nero Scrum board** project (`https://github.com/users/rodcordeiro/projects/14`).

## Rules

1. **Current iteration first.** Before starting work, list open issues in the **current** iteration that are `ready-for-agent` (or otherwise actionable) and unblocked. Prefer those.
2. **Pull next only when current is empty.** If the current iteration has no pending actionable tickets, move the next priority unblocked ticket from **next** (or backlog) into **current**, then work it.
3. **New tasks default to next.** Any newly created task goes to the **next** iteration unless:
   - the user explicitly requests current, or
   - the task is required to complete / unblock work already in the **current** iteration.
4. **Do not starve the board.** Do not invent scope in current while next holds the agreed priority order.

## Priority order (code-graph pack)

GitHub Issues on [Nero Scrum board](https://github.com/users/rodcordeiro/projects/14) — **Iteration 1** (current as of 2026-08-26 seed migrate):

| # | Title | Blocked by |
| --- | --- | --- |
| [#1](https://github.com/rodcordeiro/nero-code-graph/issues/1) | Freeze GraphDocument contracts | — |
| [#2](https://github.com/rodcordeiro/nero-code-graph/issues/2) | CodeGraph core with fakes | #1 |
| [#3](https://github.com/rodcordeiro/nero-code-graph/issues/3) | Project artifact store + allowlist | #1 |
| [#4](https://github.com/rodcordeiro/nero-code-graph/issues/4) | MCP stdio tools | #2, #3 |
| [#5](https://github.com/rodcordeiro/nero-code-graph/issues/5) | Extractor / Banky TS pilot | #4 |
| [#6](https://github.com/rodcordeiro/nero-code-graph/issues/6) | Freshness / stale | #5 |
| [#7](https://github.com/rodcordeiro/nero-code-graph/issues/7) | Skill routing | #4 |
| [#8](https://github.com/rodcordeiro/nero-code-graph/issues/8) | Knowledge mirror | #6 |

Seed migrate exception: this entire pack backlog was placed in **current** (Iteration 1) on purpose. Ongoing rule still applies for *new* work after this batch.

## Tracker pointers

- Issues: GitHub (`docs/agents/issue-tracker.md`)
- Labels: `docs/agents/triage-labels.md`
- Project: Nero Scrum board (#14), Iteration field from the board’s iteration template
