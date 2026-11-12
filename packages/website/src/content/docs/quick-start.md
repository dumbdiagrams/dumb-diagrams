---
title: Quick start
description: Install the CLI, create a project, and open your first diagram in Studio.
seoTitle: Getting Started with Diagrams as Code
seoDescription: Install the Dumb Diagrams CLI, create a diagram project, and open your first diagram in Studio.
section: Start here
order: 1
---
You need **Node.js 24 or newer**. Check your version with `node --version`. The install command below uses npm, which comes with Node.js.

Install `create-dumb-diagrams` once. The main command is `dumbdiagrams`; `dgm` is a shorter alias for the same thing.

```bash
npm install -g create-dumb-diagrams
cd path/to/your-projects
dumbdiagrams init
cd <project-folder>
dumbdiagrams studio
```

`init` asks for a project name and creates that folder in the current directory. Leave the name blank to use a timestamped folder. Then `studio` opens the local editor; choose **Open** to select any `.dgm` file on your machine. Keep the command running while you work and stop it with `Ctrl+C`.

## What the project contains

The project contains your style preferences, agent instructions, `.dumbdiagrams/` knowledge, and a documented `diagrams/` workspace:

```text
  preferences.json   Your diagram style: step badges, arrow labels, icon labels
  README.md          What to edit and what to leave alone
  diagrams/          Diagram bundles with persisted architecture briefs
  .dumbdiagrams/     Instructions, format, and catalog the agent reads
  AGENTS.md          Instructions for coding agents
  CLAUDE.md          Another agent entry point
  GEMINI.md          Another agent entry point
```

`preferences.json` is the file meant for you. `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `.dumbdiagrams/` work as they are for any agent; you normally do not need to change them.

## Preferences

`preferences.json` sets the style every diagram in the project follows:

```json
{
  "$schema": "./.dumbdiagrams/preferences.schema.json",
  "numberedSteps": true,
  "edgeLabels": true,
  "resourceLabels": true
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `numberedSteps` | `true` | Number main flow arrows with native `step N` badges. Keep edge labels descriptive and unnumbered. Dashed and failure arrows stay unnumbered. |
| `edgeLabels` | `true` | Give every arrow a short label. |
| `resourceLabels` | `true` | Show names under icons. Set `false` to draw icons only. |

`dumbdiagrams validate` fails when a diagram ignores a preference, so the agent corrects it before finishing. To change one diagram only, ask the agent; it records the exception in that diagram's `requirements.json` under `preferences` and leaves the project file alone.

For example, write `label "Store input drawing" step 1`. A label such as `"1. Store input drawing"` does not create a step badge; the number belongs in the edge's `step` field.

By default, an agent creates `diagrams/<name>/diagram.requirements.json` before `diagram.dgm`, beside an `architecture-brief.md` that records the goal and important decisions. The requirements file lists stable component and relationship IDs, required counts, and containment. Keep it alongside the diagram through layout edits. Studio can open the `.dgm` wherever you decide to keep it.

## Create and edit a first draft

Ask your coding agent to read `AGENTS.md` and the relevant `.dumbdiagrams/` guidance, then describe the architecture you want. [Work with an agent](../agent-workflow/) includes a prompt you can adapt. You can also write the source yourself or use Studio’s source editor.

Open the new diagram in Studio. Change a label in the source editor, move an item on the canvas, and save. Both kinds of change stay in the same portable `.dgm` file.

[Using Studio](../studio/) shows the editor and explains its visual controls and save behavior.

## Command reference

| Command | What it does |
| --- | --- |
| `dumbdiagrams init` | Create a project folder with agent guidance and a diagram workspace. |
| `dumbdiagrams studio` | Start the local editor, then use **Open** to choose a `.dgm` file. |
| `dumbdiagrams validate <files…>` | Check each diagram against its required `.requirements.json` companion and the project's `preferences.json`, and report provider findings. Add `--strict` to include routing findings; use `-` for standard input. |
| `dumbdiagrams format <file.dgm>` | Print canonical source. Add `--check` to verify formatting or `--write` to update the file. |
| `dumbdiagrams render <file.dgm> -o diagram.svg` | Render a portable SVG. Omit `-o` to write it to standard output. |
| `dumbdiagrams --help` | Show command help. Use `--version` to print the installed version. |

Run normal validation and then `dumbdiagrams validate --strict <files…>`. If findings are fixable, make at most two focused repair passes and rerun both. The completeness check confirms only that the diagram matches the written contract; review the contract against your request. Every command also works with the `dgm` alias. Next, [create a draft with an agent](../agent-workflow/) or [learn the source format](../source-format/).
