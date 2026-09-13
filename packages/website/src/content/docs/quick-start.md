---
title: Quick start
description: Set up a project and open a .dgm file in Studio.
section: Start here
order: 1
---
You need **Node.js 24 or newer**. Check your version with `node --version`. The install command below uses npm, which comes with Node.js.

The **agent workflow** uses a separate coding agent, such as **Codex, Claude Code, Cursor, Gemini**, or an open-source alternative. Dumb Diagrams provides the source format, agent guidance, and Studio; it does not bundle an agent.

## Create a project

Install the CLI and run `init` from the directory where you want the new project folder:

```bash
npm install -g create-dumb-diagrams
cd path/to/your-projects
dumbdiagrams init
cd <project-folder>
```

The initializer asks for a project name and uses it for the new folder. Leave the prompt blank, or run without a terminal, to create a timestamped `dumb-diagrams-YYYY-MM-DD-HH-MM-SS` folder in the current directory. It prints the exact folder path when it finishes.

The project contains agent instructions, `.dumbdiagrams/` knowledge, and a documented `diagrams/` workspace:

```text
  .dumbdiagrams/     Shared instructions, catalog, and reference examples
  diagrams/          Diagram bundles with persisted architecture briefs
  AGENTS.md          Instructions for coding agents
  CLAUDE.md          Another agent entry point
  GEMINI.md          Another agent entry point
```

Keep `.dumbdiagrams/examples/` as reference material. By default, agents create `diagrams/<name>/diagram.dgm` together with `diagrams/<name>/architecture-brief.md`. The brief records the normalized goal, explicit requirements, relationships and containment, and inferred decisions and exclusions for review and debugging. If you choose another source location, Studio can still open the `.dgm` by file selection.

Start Studio separately:

```bash
dumbdiagrams studio
```

Studio is independent of the repository where it was launched. Select **Open** to choose any `.dgm` file from anywhere on disk. Keep the CLI process running while you work; stop it with `Ctrl+C` when finished.

## Create and edit a first draft

Ask your coding agent to read `AGENTS.md` and the relevant `.dumbdiagrams/` guidance, describe your architecture, and create a `.dgm` file. Then open it in Studio to review and refine it. [Work with an agent](../agent-workflow/) includes a prompt you can adapt. If you are working manually, use Studio’s source editor instead.

Open a diagram in Studio and change a service label in the source editor. A valid edit recompiles into a new diagram. You can also select and move an item on the canvas.

In local Studio, saves go back to the selected `.dgm` file. Look at the file in your editor to review its source and saved visual decisions. [Using Studio](../studio/) explains file selection and save conflicts.

`dgm init` and `dgm studio` are optional shorthand forms. Next, [create a draft with an agent](../agent-workflow/) or [learn the source format](../source-format/).
