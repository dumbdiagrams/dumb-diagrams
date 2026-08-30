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

Install the package once, then run the two commands from the repository where
an agent will work:

```bash
npm install -g create-dumb-diagrams
cd path/to/your-repository
dumbdiagrams init
dumbdiagrams studio
```

`init` asks for the repository/project name and writes the agent entrypoints and
`.dumbdiagrams/` guidance into the current repository. `studio` starts the
generic local editor and is independent of the directory where it was started.
Use **Open** inside Studio to select any `.dgm` file on disk.

`dgm init` and `dgm studio` are convenience shorthands for the canonical
`dumbdiagrams` commands.

## What `init` creates

- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` — small agent entrypoints
- `.dumbdiagrams/` — canonical workflow, architecture, format, provider, and catalog knowledge
- `.dumbdiagrams/examples/` — reference examples for agent prompts and source

## Commands

```bash
dumbdiagrams init                                               # prepare the current repository
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
