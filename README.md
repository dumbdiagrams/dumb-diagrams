# DumbDiagrams

LLM-first architecture diagrams with deterministic layout and practical manual controls.

## Quick start

```bash
pnpm install
pnpm build
pnpm test

# Render a fixture
node packages/cli/dist/index.js fixtures async-docs

# Render from source
node packages/cli/dist/index.js render examples/src/async-docs.arch output.svg

# Live preview (code → canvas)
node packages/cli/dist/index.js dev examples/src/async-docs.arch

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
- `@dumb-diagrams/dsl` — `.arch` parser and printer
- `@dumb-diagrams/cli` — `arch render`, `arch dev`, `arch check`
- `@dumb-diagrams/editor` — browser editor (Vite + React)
- `@dumb-diagrams/mcp` — MCP server for agent integration

## Editor

```bash
cd packages/editor && pnpm dev
```

## MCP

```bash
node packages/mcp/dist/index.js
```

Tools: `diagram.read`, `diagram.load`, `diagram.validate`, `diagram.add_resource`, `diagram.connect`, `diagram.render`, `diagram.auto_layout`
