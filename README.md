# DumbDiagrams

LLM-first diagrams with deterministic layout and practical manual controls.

## Quick start

```bash
pnpm install
pnpm build
pnpm test

# Render a fixture
node packages/cli/dist/index.js fixtures async-docs

# Render from source
node packages/cli/dist/index.js render examples/src/aws-high-availability-web-app.dgm output.svg

# Full browser editor (menus, tools, inspectors)
pnpm dev

# Minimal CLI preview (code → canvas)
pnpm dev:cli -- examples/src/aws-high-availability-web-app.dgm

# Validate examples
node packages/cli/dist/index.js check examples/src
```

## Packages

- `@dumb-diagrams/core` — document model, validation, fixtures
- `@dumb-diagrams/catalog` — AWS/Azure/GCP resource catalog
- `@dumb-diagrams/grammar-aws` — AWS visual grammar tokens
- `@dumb-diagrams/layout` — semantic layout engine
- `@dumb-diagrams/route` — Manhattan router with label obstacles
- `@dumb-diagrams/render` — SVG renderer + invariant checks
- `@dumb-diagrams/dsl` — `.dgm` parser and printer
- `@dumb-diagrams/cli` — `dgm render`, `dgm dev`, `dgm check`
- `@dumb-diagrams/editor` — browser editor (Vite + React)
- `@dumb-diagrams/mcp` — MCP server for agent integration

## Editor

```bash
pnpm dev
```

The minimal source-and-canvas CLI preview remains available with
`pnpm dev:cli -- examples/src/aws-high-availability-web-app.dgm`.

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

All ten workspace packages are released together from a `vMAJOR.MINOR.PATCH`
tag. The versioning rules, compatibility promises, and release checklist live
in [docs/VERSIONING.md](./docs/VERSIONING.md) and [docs/RELEASE.md](./docs/RELEASE.md).
The editor is deployed as a static site by GitHub Actions, with a manual
previous-tag deployment for rollback.

See [CHANGELOG.md](./CHANGELOG.md) for release notes.

## MCP

```bash
node packages/mcp/dist/index.js
```

Tools: `diagram.read`, `diagram.load`, `diagram.validate`, `diagram.add_resource`, `diagram.connect`, `diagram.render`, `diagram.auto_layout`
