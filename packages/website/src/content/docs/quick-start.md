---
title: Quick start
description: Prepare a repository for agents, then open any portable .dgm file in Studio.
section: Start here
order: 1
---
You need **Node.js 24 or newer**. Check your version with `node --version`.
The install command below uses npm, which comes with Node.js.

The **agent workflow** uses a separate coding agent, such as **Codex, Claude Code, Cursor, Gemini**, or an open-source alternative. Dumb Diagrams provides the source format, agent guidance, and Studio; it does not bundle an agent.

## Prepare a repository

Install the CLI and run `init` in the repository that should provide context to
your coding agent:

```bash
npm install -g create-dumb-diagrams
cd path/to/your-repository
dumbdiagrams init
```

The initializer keeps its prompt for the repository/project name, then writes
agent instructions and `.dumbdiagrams/` knowledge into the current directory.

Start Studio separately:

```bash
dumbdiagrams studio
```

Studio is not tied to the repository where it was launched. Select **Open** to
choose any `.dgm` file from anywhere on disk. Keep the CLI process running while
you work; stop it with `Ctrl+C` when finished.

## Know what was created

The initialized repository contains ordinary agent guidance files:

```text
  .dumbdiagrams/     Shared instructions, catalog, and reference examples
  AGENTS.md          Instructions for coding agents
  CLAUDE.md          Another agent entry point
  GEMINI.md          Another agent entry point
```

Keep `.dumbdiagrams/examples/` as reference material. Store `.dgm` files
wherever makes sense for your repository or workflow; Studio can open them by
file selection.

## Create the first draft with an agent

Ask your coding agent to read `AGENTS.md` and the relevant `.dumbdiagrams/`
guidance, describe your architecture, and create a `.dgm` file. Then open that
file in Studio to review and refine it.

[Work with an agent](../agent-workflow/) walks through the setup and includes a prompt you can adapt. If you are working manually, continue with the source editor in Studio.

## Make the first change

Open a diagram in Studio and change a service label in the source editor. A valid edit recompiles into a new diagram. You can also select and move an item on the canvas.

In local Studio, saves go back to the selected `.dgm` file. Look at the file in
your editor to review source and saved visual decisions. [Using Studio](../studio/)
explains file selection and save conflicts.

`dgm init` and `dgm studio` are optional shorthand forms. Next, [create a draft
with an agent](../agent-workflow/) or [learn the source format](../source-format/).
