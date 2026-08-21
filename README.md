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
node packages/cli/dist/index.js render examples/src/async-docs.dgm output.svg

# Full browser editor (menus, tools, inspectors)
pnpm dev

# Minimal CLI preview (code → canvas)
pnpm dev:cli -- examples/src/async-docs.dgm

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
`pnpm dev:cli -- examples/src/async-docs.dgm`.

## MCP

```bash
node packages/mcp/dist/index.js
```

Tools: `diagram.read`, `diagram.load`, `diagram.validate`, `diagram.add_resource`, `diagram.connect`, `diagram.render`, `diagram.auto_layout`
