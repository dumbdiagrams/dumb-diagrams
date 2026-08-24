# Catalog assets

This directory is the checked-in source of truth for the icon catalog.

```text
assets/catalog/
  collisions.json       reviewed type-collision policy
  sources.lock.json     provider versions, archive hashes, and terms
  sources/
    aws/
    azure/
    gcp/
    cloud-agnostic/
```

Provider files are vendored so builds, exports, and the packaged Studio never
download artwork at runtime. See [`../../ICON-NOTICES.md`](../../ICON-NOTICES.md)
for attribution and provider terms.

## Lifecycle

1. `pnpm icons:update --provider <aws|azure|gcp> --accept-terms` downloads only
   the archive pinned in `sources.lock.json`, verifies its SHA-256 digest, and
   replaces that provider's source directory.
2. `pnpm catalog:generate` validates the source SVGs and writes the canonical
   runtime manifest to
   `packages/runtime/src/catalog/generated/manifest.json`.
3. `pnpm catalog:stage` copies the manifest and browser-ready SVGs to
   `packages/editor/public/`.
4. `pnpm icons:check` checks minimum inventory counts, source/manifest parity,
   hashes, and staged browser assets.

`pnpm build` performs generation before compiling the runtime, then the
editor's `prebuild` stages browser assets. Editor development and Playwright
startup also stage them, so a clean checkout does not depend on generated files
being committed.

The runtime manifest is canonical and reviewed in Git. The staged
`packages/editor/public/catalog-icons/` directory and
`packages/editor/public/catalog-manifest.json` are reproducible and ignored.
Do not edit either staged output by hand.

Catalog source identifiers deliberately retain their stable historical
provider-relative identity when directories are reorganized. Moving a source
container must not rename every public icon asset.
