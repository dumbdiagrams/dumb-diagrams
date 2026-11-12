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

For numbered steps, put the sequence in each edge's native `step N` field and
keep its label descriptive only: `label "Store input drawing" step 1`, not
`label "1. Store input drawing"`. Validation reports labels with an obvious
leading step prefix, including when numbered steps are disabled.

Open a `.dgm` with **File → Open** in Chrome or Edge to link it to Studio.
The **Live** indicator confirms that external file changes refresh automatically
after a short quiet period. Partial or invalid writes keep the current diagram
visible; unsaved Studio edits are preserved until you review the file change.
Click the indicator or choose **File → Reload from disk** to check immediately.
This works in both hosted and local Studio. Files imported through a browser's
fallback upload picker are snapshots and cannot refresh automatically.

**File → Auto-save** is checked by default. Valid Studio edits, Undo, and Redo
write back to a linked file after a short pause. Each accepted external update
is one undoable change in the current session. Turn Auto-save off to use manual
**Save** instead; **Unsaved**, **Saving…**, or **Save failed** makes pending file
changes visible. Concurrent external edits pause saving until you review them.
Closing with linked changes still pending triggers the browser's exit warning.
**Browser only** means a tab has no live file link: use **Save As** to link it.
Recovered browser tabs need a new file link after restarting the browser.
Allow write access when opening a linked file. If access is denied or revoked,
edits remain in Studio and **Save** lets you grant access and retry.

Successful `init` and help commands end with the installed CLI version. In an
interactive terminal, the footer also confirms when you are on npm's latest
release or suggests an optional update command when a newer version is available.
The check times out after one second; if it cannot reach npm, the footer says
the latest version could not be checked. Set `NO_UPDATE_NOTIFIER=1` to skip the
lookup. CI and redirected output show only the installed version. The lookup
only requests public npm version metadata; it does not send project data.

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
