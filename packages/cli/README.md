# create-dumb-diagrams

**Portable plain-text architecture diagrams for coding agents and people.**

[![npm version](https://img.shields.io/npm/v/create-dumb-diagrams?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/create-dumb-diagrams)
[![Node.js](https://img.shields.io/node/v/create-dumb-diagrams?color=339933&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)

A local CLI and browser editor for `.dgm` files: an agent describes resources,
boundaries, and connections; the engine validates, lays out, routes, and
renders deterministic SVG. Requires Node.js 24 or newer.

## Quick start

```bash
npm install -g create-dumb-diagrams
dumbdiagrams init      # asks for a project name and creates that folder
cd <project-folder>
dumbdiagrams studio    # local editor; use Open to pick any .dgm file
```

`init` writes agent entrypoints (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`),
`.dumbdiagrams/` guidance (format, architecture, providers, catalog), a
`diagrams/` workspace, and a root `preferences.json` for your diagram style:
`numberedSteps` (step badges on the main flow), `edgeLabels` (label every
arrow), and `resourceLabels` (`false` draws icons only). Validation fails when a diagram ignores
them. Edit `preferences.json`; the entrypoints and `.dumbdiagrams/` normally
stay as they are. With a blank name, or without a
terminal, it uses a timestamped folder. `dgm` is a shorthand for
`dumbdiagrams`.

After a successful `init` or help command in an interactive terminal, the CLI
checks npm for a newer release and prints an update command if one is available.
The check times out after one second, fails silently when offline, and can be
disabled with `NO_UPDATE_NOTIFIER=1`. It only requests the package's public npm
version metadata; it does not send project data.

## Commands

```bash
dumbdiagrams validate a.dgm b.dgm           # source/provider validity and required architecture
dumbdiagrams validate --strict diagrams/*/*.dgm   # also fail on routing findings
dumbdiagrams validate --json a.dgm          # separate validity, completeness, routing reports
dumbdiagrams validate --requirements custom.json a.dgm
dumbdiagrams format a.dgm                   # print canonical source
dumbdiagrams format --check a.dgm           # exit 1 if not canonical
dumbdiagrams format --write a.dgm           # rewrite in place
dumbdiagrams render a.dgm -o a.svg          # deterministic, self-contained SVG
```

Validation requires `requirements.json` beside `diagram.dgm`, or
`<stem>.requirements.json` for other filenames. Agents extract this contract
before writing source; layout repairs must preserve it. Initialized projects
include the schema, an example, and concise authoring instructions. The checker
verifies the extracted contract, not natural-language interpretation.

Use `-` as the path to read standard input; validation also needs
`--requirements <path>` in that case. Parse errors print as
`path:line:column: message`. Nothing is written when the input is invalid.
Studio listens on `127.0.0.1:4788`, or on a free port if 4788 is taken, and
targets Chromium-based desktop browsers.

## Documentation

The website documents the source format, layout, routing, Studio, and exports.
The repository's `CONTRIBUTING.md` covers building and testing this package
from source.

## License and source

Licensed under the [GNU AGPL v3.0 only](./LICENSE). The package includes the
buildable corresponding source under `dist/source/`, including the vendored
catalog under `assets/catalog/`. npm omits dotfiles, so `registry.npmrc` ships
in place of `.npmrc`: run `cp registry.npmrc .npmrc` and then
`pnpm install --frozen-lockfile` before rebuilding.
