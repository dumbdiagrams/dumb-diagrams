# dumbdiagrams

**LLM-first architecture diagrams that are hard to get wrong.**

Local CLI and Studio for agent-generated `.dgm` source files — deterministic layout, validated catalog types, human controls when you need them.

[![npm version](https://img.shields.io/npm/v/dumbdiagrams?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/dumbdiagrams)
[![Node.js](https://img.shields.io/node/v/dumbdiagrams?color=339933&logo=node.js&logoColor=white)](https://nodejs.org/)
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

```bash
npx dumbdiagrams@latest init --open-editor
```

When no directory or name is supplied in an interactive terminal, `init` asks what the project should be called. For scripted use, pass values explicitly or use `--yes` for a timestamped fallback:

```bash
dumbdiagrams init --name "Payments Platform" --diagram system-overview
dumbdiagrams init --directory ./projects/payments --name "Payments Platform"
dumbdiagrams init --name payments --description "Event-driven billing system."
dumbdiagrams init --yes
```

## What `init` creates

- `diagrams/` — starter `.dgm` source (one file per diagram)
- `DUMB_DIAGRAMS.md`, `AGENTS.md`, `CLAUDE.md` — agent instructions
- `CATALOG.md` / `CATALOG.json` — canonical resource and group types
- `examples/` — bundled source/prompt pairs for style reference

Use `--editor cursor` or `--editor code` to pick an editor. Without `--editor`, `--open-editor` tries Cursor, VS Code, Codium, Windsurf, and Zed in that order.

## Commands

```bash
dumbdiagrams help                         # full command reference
dumbdiagrams studio diagrams              # local Studio
dumbdiagrams validate diagrams            # check every .dgm in a folder
dumbdiagrams render diagrams/foo.dgm --output foo.svg
dumbdiagrams format diagrams/foo.dgm      # print canonical source
```

Run `dumbdiagrams help` for init, studio, and render flags.

## Maintainer tarball test

From a full repository checkout (not from an installed npm package):

```bash
pnpm install
pnpm build
mkdir -p .artifacts/packages
pnpm --dir packages/cli pack --pack-destination ../../.artifacts/packages

VERSION="$(node -p 'require("./packages/cli/package.json").version')"
ARTIFACT="$(pwd)/.artifacts/packages/dumbdiagrams-$VERSION.tgz"
npx --yes --package="$ARTIFACT" dumbdiagrams init ./preview-project --yes
npx --yes --package="$ARTIFACT" dumbdiagrams validate ./preview-project/diagrams
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
