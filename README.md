# Dumb Diagrams

LLM-first diagrams with deterministic layout and practical manual controls.

End users install the `dumbdiagrams` npm package, not this repository. The
repository is for developing the editor and publishing the CLI package.

## Install and create a project

```bash
npx dumbdiagrams@latest init --open-editor
# Prompts for a project name and opens it in your editor.
# Run the printed `Next:` command to open its diagrams folder in Studio.
```

In an interactive terminal, omitting the directory opens a project-name prompt.
The answer becomes the display name and a safe kebab-case folder name. Existing
positional syntax remains available, and scripts can use explicit flags:

```bash
# Named folder and starter diagram
npx dumbdiagrams@latest init \
  --name "Payments Platform" \
  --diagram system-overview \
  --description "Event-driven billing architecture."

# Separate output path and display name
npx dumbdiagrams@latest init \
  --directory ./projects/payments \
  --name "Payments Platform"

# Non-interactive timestamped fallback
npx dumbdiagrams@latest init --yes
```

The project folder is the shared workspace for the human and the coding agent.
Authored diagrams live as separate `.dgm` files under `diagrams/`; Studio
watches the selected file and renders the result. The initializer also creates
`DUMB_DIAGRAMS.md`, `AGENTS.md`, and `CLAUDE.md`, plus an `examples/` directory
containing the three built-in source diagrams and their matching prompts. To
open the project in an installed editor during initialization, add
`--open-editor` or choose one explicitly with `--editor cursor` / `--editor code`.

The initializer also writes `CATALOG.md` and `CATALOG.json`, which give agents
the canonical resource/group types and parent constraints needed to select the
correct provider icons. A `.dgm` type selects the icon; its quoted label only
changes display text.

## Test the standalone package locally

This exercises the same package boundary as `npx`, without publishing anything
and without putting repository source files in the package. From the repository
root:

```bash
pnpm install
pnpm build
mkdir -p .artifacts
pnpm --dir packages/cli pack --pack-destination ../../.artifacts

ARTIFACT="$(pwd)/.artifacts/dumbdiagrams-1.0.0.tgz"
PROJECT_DIR="../dumb-diagrams-$(date +%Y-%m-%d-%H-%M-%S)"
npx --yes \
  --package="$ARTIFACT" \
  dumbdiagrams init "$PROJECT_DIR" --open-editor --editor cursor
npx --yes \
  --package="$ARTIFACT" \
  dumbdiagrams studio "$PROJECT_DIR/diagrams"
```

`PROJECT_DIR` is a sibling of the repository, so this test project stays on
the Desktop without becoming part of the `dumb-diagrams` worktree. Use
`--editor code` instead of `--editor cursor` for VS Code.

The packed CLI bundles the diagram runtime and includes the compiled Studio,
logo, provider icons, and the example source/prompt pairs copied into each new
project. The initializer generates a project-local catalog reference from the
same runtime catalog. The tarball contains no repository `src/` tree. When
published, the same commands become `npx dumbdiagrams@latest …`.

Once the project is open in Cursor, VS Code, Claude Code, Codex, or another
coding agent, use a prompt like:

```text
Read DUMB_DIAGRAMS.md, diagrams/README.md, and examples/README.md. Inspect
the closest prompt/source pair in examples/. For a new request, create a new
descriptive file under diagrams/; do not overwrite an existing .dgm unless the
user names it explicitly. Follow the examples' explicit hierarchy, labels,
numbered stages, edge direction hints, and routing constraints. Run
`npx dumbdiagrams@latest validate diagrams` when finished.
```

## Develop this repository

```bash
pnpm install
pnpm build
pnpm test

# Render a fixture
node packages/cli/dist/index.js fixtures async-docs

# Open the local Studio against a source file
node packages/cli/dist/index.js studio examples/src/aws-high-availability-web-app.dgm

# Render from source
node packages/cli/dist/index.js render examples/src/aws-high-availability-web-app.dgm --output output.svg

# Validate examples
node packages/cli/dist/index.js validate examples/src

# Create an agent-ready project
node packages/cli/dist/index.js init --name "Local Preview" --open-editor
```

## Packages

- `@dumb-diagrams/core` — document model, validation, fixtures
- `@dumb-diagrams/catalog` — AWS/Azure/GCP resource catalog
- `@dumb-diagrams/grammar-aws` — AWS visual grammar tokens
- `@dumb-diagrams/layout` — semantic layout engine
- `@dumb-diagrams/route` — Manhattan router with label obstacles
- `@dumb-diagrams/render` — SVG renderer + invariant checks
- `@dumb-diagrams/dsl` — `.dgm` parser and printer
- `dumbdiagrams` — the publishable CLI and local Studio runtime
- `@dumb-diagrams/editor` — browser editor (Vite + React)

## Editor

```bash
pnpm dev
```

Each `.dgm` file is the portable source of truth for one diagram.
`dumbdiagrams studio diagrams` opens the local project folder and lets the user
select a source file; `dumbdiagrams studio diagrams/name.dgm` opens one file
directly. Studio writes the selected file back to disk, watches for edits from
Cursor, Codex, Claude, or another editor, and protects saves with revision
checks. Browser-only Studio still works as a scratch/import mode when opened
through Vite or the static site.

For a new project from this repository, run `node packages/cli/dist/index.js init diagrams --open-editor`. It creates a writable
`diagrams/` folder with a starter `architecture.dgm`, a `DUMB_DIAGRAMS.md`
guide plus `AGENTS.md`/`CLAUDE.md` pointers, a small README, and an
`examples/` directory with source/prompt references.

v1 is desktop-focused. The editor intentionally keeps a 900px minimum layout
width so the canvas, tool rail, inspector, and two-row studio chrome remain
usable together. A viewport around 1280px wide is the supported baseline; a
small-screen responsive editor is out of scope for v1.

## Licensing and publication

The original DumbDiagrams source, package code, and repository-authored
examples are published under the [MIT License](./LICENSE). Generated provider
catalog icons and their source packs remain subject to the notices and terms in
[ICON-NOTICES.md](./ICON-NOTICES.md); those third-party terms control where an
icon may be redistributed.

The workspace packages are versioned together from a `vMAJOR.MINOR.PATCH` tag.
The public `dumbdiagrams` package contains the CLI, compiled diagram runtime,
and Studio assets; consumers do not need the repository source. The versioning
rules, compatibility promises, and release checklist live
in [docs/VERSIONING.md](./docs/VERSIONING.md) and [docs/RELEASE.md](./docs/RELEASE.md).
The editor is deployed as a static site by GitHub Actions, with a manual
previous-tag deployment for rollback.

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## Agent workflow

Cursor, Codex, Claude Code, or any other agent can create or edit ordinary
`.dgm` files under `diagrams/`, run `npx dumbdiagrams@latest validate diagrams`,
and let the local Studio reflect the selected change. The required project
contract is the local `DUMB_DIAGRAMS.md` file; the copied examples are
onboarding/style references, not parser or renderer dependencies.
