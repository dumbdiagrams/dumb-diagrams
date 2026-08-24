# Changelog

All notable changes to DumbDiagrams are documented here. The project follows
the versioning policy in [docs/VERSIONING.md](./docs/VERSIONING.md).

## [Unreleased]

Future changes will be grouped here until the next release tag is prepared.

## [0.1.0] - 2026-08-24

### Added

- First public `dumbdiagrams` npm package with bundled CLI runtime, Studio assets,
  catalog icons, and example templates.
- CLI integration tests, package tarball smoke checks, and Playwright coverage in CI.
- Init project templates and release documentation for private tarball testing.

### Changed

- Workspace packages normalized to `0.1.0` for the first npm release.
- CLI `render` and `validate` now require explicit paths for published usage.
- Release artifact includes `LICENSE` and `ICON-NOTICES.md`.

### Notes

- v1 does not promise a mobile editor layout.
- Provider icon redistribution remains governed by [ICON-NOTICES.md](./ICON-NOTICES.md).

## [1.0.0] - 2026-08-23

Pre-release development milestone. Functionality shipped in the first public npm
release is documented under `0.1.0` above.
