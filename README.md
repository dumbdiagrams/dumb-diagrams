# Dumb Diagrams

LLM-first diagrams with deterministic layout and practical manual controls.

End users install the `dumbdiagrams` npm package, not this repository. The
repository is for developing the editor and publishing the CLI package.

## Install and create a project

```bash
npx dumbdiagrams@latest init my-diagrams --open-editor
cd my-diagrams
npx dumbdiagrams@latest studio architecture.dgm
```

The project folder is the shared workspace for the human and the coding agent:
the agent edits `architecture.dgm`, while Studio watches the file and renders
the result. The initializer also creates `DUMB_DIAGRAMS.md`, `AGENTS.md`, and
`CLAUDE.md`, plus an `examples/` directory containing the three built-in style
references. To open the project in an installed editor during initialization,
add `--open-editor` or choose one explicitly with `--editor cursor` / `--editor code`.

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
npx --yes \
  --package="$ARTIFACT" \
  dumbdiagrams init my-diagrams --open-editor
cd my-diagrams
npx --yes \
  --package="$ARTIFACT" \
  dumbdiagrams studio architecture.dgm
```

The packed CLI bundles the diagram runtime and includes the compiled Studio,
logo, provider icons, and the example files copied into each new project. The
tarball contains no repository `src/` tree. When published, the same commands
become `npx dumbdiagrams@latest …`.

Once the project is open in Cursor, VS Code, Claude Code, Codex, or another
coding agent, use a prompt like:

```text
Read DUMB_DIAGRAMS.md and examples/README.md. Inspect
examples/aws-high-availability-web-app.dgm as the closest style reference.
Create or update architecture.dgm for the requested architecture. Follow the
same explicit hierarchy, labels, numbered stages, edge direction hints, and
routing constraints. Run `npx dumbdiagrams@latest validate architecture.dgm`
when finished.
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
node packages/cli/dist/index.js init diagrams --open-editor
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

The `.dgm` file is the portable source of truth. `dumbdiagrams studio` serves
the same editor locally, writes changes back to disk, watches for edits from
Cursor, Codex, Claude, or another editor, and protects saves with revision
checks. Browser-only Studio still works as a scratch/import mode when opened
through Vite or the static site.

For a new project from this repository, run `node packages/cli/dist/index.js init diagrams --open-editor`. It creates an empty
`architecture.dgm`, a `DUMB_DIAGRAMS.md` guide plus `AGENTS.md`/`CLAUDE.md`
pointers, a small README, and an `examples/` directory with style references.

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

Cursor, Codex, Claude Code, or any other agent can edit the ordinary `.dgm`
file, run `npx dumbdiagrams@latest validate architecture.dgm`, and let the
local Studio reflect the change. The required project contract is the local
`DUMB_DIAGRAMS.md` file; the copied examples are onboarding/style references,
not parser or renderer dependencies.
