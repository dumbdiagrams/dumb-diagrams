# Changelog

All notable changes to DumbDiagrams are documented here. The project follows
the versioning policy in [docs/RELEASE.md](./docs/RELEASE.md).

## [0.1.1] - 2026-11-06

### Fixed

- Allow up to 15 minutes for npm registry propagation, with bounded requests,
  clear diagnostics, and verification-only recovery.
- Fail immediately if the published artifact integrity does not match.

### Added

- Display the installed version in CLI help and Studio startup output.
- Show a discreet version label in the Studio footer.

## [0.1.0] - 2026-11-06

First public release of the `create-dumb-diagrams` npm package.

### Added

- The `dumbdiagrams` CLI (`dgm` shorthand) with `init`, `studio`, `validate`,
  `format`, and `render`.
- Studio, a local editor for portable `.dgm` files, bundled with the CLI
  together with catalog icons and example templates.
- Portable `.dgm` source format 1 (`dgm 1` header) with AWS, Azure, GCP, and
  cloud-agnostic grammars, a strict parser that reports line and column, and a
  canonical formatter.
- Per-provider validation warnings, starting with `managed-service-in-network`.
- `validate` accepts several files and `--strict` fails on warnings.

### Notes

- v0.1 is desktop-focused and does not promise a mobile editor layout.
- Licensed AGPL-3.0-only. Provider icon redistribution remains governed by
  [ICON-NOTICES.md](./ICON-NOTICES.md).
