---
title: Command reference
description: Prepare a repository for agents and start the generic local Studio.
section: Make diagrams
order: 6
---
The published package is installed as `create-dumb-diagrams`; its canonical
command is `dumbdiagrams`. `dgm` is a convenience shorthand for the same
entrypoint.

```bash
npm install -g create-dumb-diagrams
cd path/to/your-projects
dumbdiagrams init
cd <project-folder>
dumbdiagrams studio
```

## `dumbdiagrams init`

Creates a new project folder inside the current directory for coding-agent use.
The prompt names the project and the folder. Leave it blank, or run without a
terminal, to use a timestamped `dumb-diagrams-YYYY-MM-DD-HH-MM-SS` folder,
independent of the current directory. The command prints the exact folder path
and writes `AGENTS.md`, `CLAUDE.md`,
`GEMINI.md`, `.dumbdiagrams/` guidance, and `diagrams/README.md` there. The
generated workflow stores each new diagram with a reviewable Markdown
architecture brief by default.

## `dumbdiagrams studio`

Starts the local Studio server and opens the generic editor. Use **Open** in the
editor to select any `.dgm` file anywhere on disk. `.dgm` remains the portable
source of truth; recent files and tabs are editor session conveniences.

There are no file or folder positional arguments and no documented alternate
Studio flags. The local server is bound to `127.0.0.1` for desktop use.

Both commands support normal `--help` and `--version` handling. The CLI is
intentionally small: use the runtime and Studio for editing and exporting.
