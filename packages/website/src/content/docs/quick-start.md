---
title: Quick start
description: Go from an empty folder to a diagram you can edit, validate, and keep in Git.
section: Start here
order: 1
---
You need **Node.js 24 or newer**. Check your version with `node --version`. The commands below use npm, which comes with Node.js.

## Create a project

Run this in the parent directory where you want your diagram project to live:

```bash
npm create dumb-diagrams@latest
```

The initializer asks for a diagram space name, then creates a project folder. It adds a starter diagram, a catalog, examples, and instructions for coding agents. Follow the `Next:` command printed in your terminal to open the right folder in Studio.

If you prefer a predictable folder name and no prompt:

```bash
npm create dumb-diagrams@latest my-architecture -- --yes
cd my-architecture
npx create-dumb-diagrams@latest studio diagrams
```

Studio opens in your browser. The CLI process stays in the terminal and connects Studio to your files. Keep it running while you work; use `Ctrl+C` when you are finished.

> Want to open the project in your coding editor too? Add `--open-editor` to the initializer. This opens an editor; it does not replace the separate command that starts Studio.

## Know what was created

The project is deliberately ordinary:

```text
my-architecture/
  diagrams/          Your editable .dgm files
  examples/          Reference diagrams and prompts
  DUMB_DIAGRAMS.md   The project’s diagram conventions
  AGENTS.md          Instructions for coding agents
  CLAUDE.md          Another agent entry point
  CATALOG.md         Readable icon and type inventory
  CATALOG.json       The same inventory for tools
```

Put new diagrams under `diagrams/`. Keep `examples/` as a reference rather than overwriting an example with your own system.

## Make the first change

Open a diagram in Studio and change a service label in the source editor. A valid edit recompiles into a new diagram. You can also select and move an item on the canvas.

In local Studio, saves go back to the connected `.dgm` file. Look at the file in your editor to see how the source and saved visual decisions fit together. [Using Studio](../studio/) explains disk changes and save conflicts.

## Check and export

Validate all the diagrams in your project:

```bash
npx create-dumb-diagrams@latest validate diagrams
```

To export one diagram from the terminal, use its actual filename. For example, if you saved it as `payments.dgm`:

```bash
npx create-dumb-diagrams@latest render diagrams/payments.dgm --output payments.svg
```

The SVG is portable, with its catalog icons included. You can also export images and PDF from Studio.

## Optional global install

If you use the tool frequently, install the command once:

```bash
npm install -g create-dumb-diagrams
dumbdiagrams studio diagrams
dgm validate diagrams
```

`dumbdiagrams` and `dgm` are aliases for the same CLI. You do not need a global install to use the `npx` commands elsewhere in these docs.

Next, [give an agent the first draft](../agent-workflow/) or [learn the source format](../source-format/).
