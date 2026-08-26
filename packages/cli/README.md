# create-dumb-diagrams

**LLM-first architecture diagrams that are hard to get wrong.**

Local CLI and Studio for agent-generated `.dgm` source files — deterministic layout, validated catalog types, human controls when you need them.

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

```bash
npm create dumb-diagrams@latest -- --open-editor
```

When no directory or name is supplied in an interactive terminal, the initializer asks what the diagram space should be called. The default is based on the current directory and a timestamp. For scripted use, pass values explicitly or use `--yes` for the same timestamped fallback:

```bash
npm create dumb-diagrams@latest payments -- --name "Payments Platform" --diagram system-overview
npx create-dumb-diagrams@latest init --directory ./projects/payments --name "Payments Platform"
npx create-dumb-diagrams@latest init --name payments --description "Event-driven billing system."
npm create dumb-diagrams@latest -- --yes
```

## What `init` creates

- `diagrams/` — starter `.dgm` source (one file per diagram)
- `DUMB_DIAGRAMS.md`, `AGENTS.md`, `CLAUDE.md` — agent instructions
- `CATALOG.md` / `CATALOG.json` — canonical resource and group types
- `examples/` — bundled source/prompt pairs for style reference

Use `--editor cursor` or `--editor code` to pick an editor. Without `--editor`, `--open-editor` tries Cursor, VS Code, Codium, Windsurf, and Zed in that order.

## Commands

```bash
npx create-dumb-diagrams@latest help                         # full command reference
npx create-dumb-diagrams@latest studio diagrams              # local Studio
npx create-dumb-diagrams@latest validate diagrams            # check every .dgm in a folder
npx create-dumb-diagrams@latest render diagrams/foo.dgm --output foo.svg
npx create-dumb-diagrams@latest format diagrams/foo.dgm      # print canonical source
```

Run `npx create-dumb-diagrams@latest help` for init, studio, and render flags.

## Maintainer tarball test

From a full repository checkout (not from an installed npm package):

```bash
pnpm install
pnpm build
mkdir -p .artifacts/packages
pnpm --dir packages/cli pack --pack-destination ../../.artifacts/packages

VERSION="$(node -p 'require("./packages/cli/package.json").version')"
ARTIFACT="$(pwd)/.artifacts/packages/create-dumb-diagrams-$VERSION.tgz"
npx --yes --package="$ARTIFACT" create-dumb-diagrams ./preview-project --yes
npx --yes --package="$ARTIFACT" create-dumb-diagrams validate ./preview-project/diagrams
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
