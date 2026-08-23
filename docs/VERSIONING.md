# Versioning strategy

DumbDiagrams uses Semantic Versioning for the ten workspace packages:

- `MAJOR` changes may break the `.dgm` grammar, document model, public package
  APIs, renderer output contract, or supported deployment behavior.
- `MINOR` changes add backwards-compatible grammar, APIs, formats, editor
  capabilities, or catalog features.
- `PATCH` changes fix bugs, improve rendering, or update implementation details
  without changing the compatibility contract.

The packages are versioned and released together so a parsed document, layout,
router, renderer, CLI, MCP server, and editor always share one compatibility
line. The editor package remains private for distribution purposes, but its
version is kept in lockstep with the nine publishable packages. The repository
root is a workspace container and is not independently versioned.

Release requirements:

1. Update every `packages/*/package.json` version to the same value.
2. Add a dated entry to [CHANGELOG.md](../CHANGELOG.md).
3. Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm check`.
4. Create an annotated `vMAJOR.MINOR.PATCH` tag and push it.
5. Publish packages only after CI passes; deploy the editor from that same tag.

The `.dgm` format is stable within v1. New fields must be optional or have
documented defaults. A breaking grammar or model change requires v2, a
migration note, and an updated example corpus.
