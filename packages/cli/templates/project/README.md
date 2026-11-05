# {{projectName}}

A Dumb Diagrams project. Ask your coding agent for a diagram in plain words;
it writes each one to `diagrams/<name>/`. Open them with `dumbdiagrams studio`.

## Your preferences

Edit `preferences.json` to set the style every diagram in this project follows:

| Option | Default | Meaning |
| --- | --- | --- |
| `numberedSteps` | `true` | Number the main flow arrows with step badges (1, 2, 3, ...). |
| `edgeLabels` | `true` | Give every arrow a short label. |
| `flow` | `"lr"` | Main flow direction: `"lr"` (left to right) or `"tb"` (top to bottom). |

`dumbdiagrams validate` fails when a diagram ignores them, so the agent fixes it.
To change the style of one diagram only, just ask the agent; it records the
exception with that diagram.

## What not to edit

- `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` point your agent at the
  instructions. They work as they are for Codex, Claude, Cursor, Gemini, and
  other agents.
- `.dumbdiagrams/` holds the instructions, format, and catalog the agent reads.
  It is managed by Dumb Diagrams; you normally do not need to change it.
