# create-dumb-diagrams

**LLM-first architecture diagrams that are hard to get wrong.**

Local CLI and generic Studio for portable `.dgm` source files — deterministic
layout, catalog types, and human controls when you need them.

[![npm version](https://img.shields.io/npm/v/create-dumb-diagrams?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/create-dumb-diagrams)
[![Node.js](https://img.shields.io/node/v/create-dumb-diagrams?color=339933&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)

Requires Node.js 24 or newer.

## How routing works

Connectors use deterministic Manhattan routing: they attach to visible icon
ports and travel only horizontally or vertically. The router scores candidate
ports and obstacle-free gutters for card collisions, connector crossings,
unrelated junctions, crowded lanes, bends, and distance, with grid-based A* as
a fallback for constrained diagrams. Pinned routes and exact fractional port
attachments are preserved; face-only hints may move when another face produces
a substantially cleaner path.

## Quick start

Install the package once, then run `init` from the directory where you want the
new project folder:

```bash
npm install -g create-dumb-diagrams
cd path/to/your-projects
dumbdiagrams init
cd <project-folder>
dumbdiagrams studio
```

`init` creates a new project folder inside the current directory. It asks for a
project name and uses that name for the folder. Leave the prompt blank, or run
without a terminal, to get a timestamped folder based on the current directory,
such as `my-projects-2026-08-30-14-32-10`. The command prints the exact folder
path when it finishes. It writes the agent entrypoints, `.dumbdiagrams/`
guidance, and a documented `diagrams/` workspace there. New agent-authored
diagrams default to `diagrams/<name>/diagram.dgm` with a persisted
`diagrams/<name>/architecture-brief.md`. `studio` starts the generic local
editor. Use **Open** inside Studio to select any `.dgm` file on disk.

`dgm init` and `dgm studio` are convenience shorthands for the canonical
`dumbdiagrams` commands.

## What `init` creates

- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` — small agent entrypoints
- `.dumbdiagrams/` — canonical workflow, architecture, format, provider, and catalog knowledge
- `.dumbdiagrams/providers/` — first-class AWS guidance and experimental Azure, GCP, and cloud-agnostic guidance
- `.dumbdiagrams/examples/` — reference examples for agent prompts and source
- `diagrams/README.md` — the diagram/architecture-brief bundle convention

## Commands

```bash
dumbdiagrams init                                               # create a project folder here
dumbdiagrams studio                                             # start generic local Studio
```

The CLI intentionally has only `init` and `studio` as its main user-facing
commands. Use Studio's **Open** action to select a `.dgm` file from any local
directory.

## Maintainer tarball test

From a full repository checkout (not from an installed npm package):

```bash
pnpm install
pnpm build
mkdir -p .artifacts/packages
pnpm --dir packages/cli pack --pack-destination ../../.artifacts/packages

VERSION="$(node -p 'require("./packages/cli/package.json").version')"
ARTIFACT="$(pwd)/.artifacts/packages/create-dumb-diagrams-$VERSION.tgz"
npx --yes --package="$ARTIFACT" dumbdiagrams init
npx --yes --package="$ARTIFACT" dumbdiagrams studio
```

`pnpm smoke:package` from the repository root exercises the same artifact and
rebuilds the AGPL corresponding-source snapshot inside the tarball.

## License and source

Licensed under the [GNU AGPL v3.0 only](./LICENSE). The npm artifact includes
the corresponding buildable source snapshot under `dist/source/`, including vendored
catalog inputs under `assets/catalog/`. A `registry.npmrc` file ships instead of
`.npmrc` because npm omits dotfiles from tarballs. Before rebuilding that source
on a clean machine, run `cp registry.npmrc .npmrc`, then
`pnpm install --frozen-lockfile`.
