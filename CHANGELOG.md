# Changelog

All notable changes to DumbDiagrams are documented here. The project follows
the versioning policy in [docs/VERSIONING.md](./docs/VERSIONING.md).

## [Unreleased]

### Changed

- The public initializer is now `npm create dumb-diagrams@latest`; the package
  exposes `dumbdiagrams` and `dgm` aliases for command-style usage.
- Interactive initialization asks for a diagram space name and uses a
  current-name-plus-timestamp default when no name is supplied.
- Vendored catalog assets grouped under `assets/catalog/` with documented
  generation and staging lifecycle.
- Repository examples moved to `examples/diagrams/`; generated editor catalog
  outputs and local build artifacts are no longer tracked.
- pnpm upgraded to 11.23.0 with isolated linking, strict peer/engine checks,
  lifecycle allowlisting, and dependency-boundary validation in CI.
- Explicit build ordering: generate catalog, build runtime, stage editor assets,
  then build editor and CLI.

### Notes

- Catalog source identifiers remain stable across the asset directory move.
- Packed tarballs and smoke-test output live under `.artifacts/packages/`.

## [0.1.0] - 2026-08-24

### Added

- First public `create-dumb-diagrams` npm package with bundled CLI runtime, Studio assets,
  catalog icons, and example templates.
- CLI integration tests, package tarball smoke checks, and Playwright coverage in CI.
- Init project templates and release documentation for private tarball testing.

### Changed

- Workspace packages normalized to `0.1.0` for the first npm release.
- Seven private runtime workspaces consolidated into one internal
  `@dumb-diagrams/runtime` package.
- CLI `render` and `validate` now require explicit paths for published usage.
- Release artifact includes `LICENSE` and `ICON-NOTICES.md`.
- Project licensing changed from MIT to AGPL-3.0-only before the first public
  release.

### Notes

- v0.1 is desktop-focused and does not promise a mobile editor layout.
- Provider icon redistribution remains governed by [ICON-NOTICES.md](./ICON-NOTICES.md).
