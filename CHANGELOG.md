# Changelog

All notable changes to DumbDiagrams are documented here. The project follows
the versioning policy in [docs/RELEASE.md](./docs/RELEASE.md).

## [Unreleased]

## [0.2.4] - 2026-11-09

### Changed

- **cli:** enhance version footer and update check logic for CLI (#19) ([abcf2f7](https://github.com/dumbdiagrams/dumb-diagrams/commit/abcf2f7f014e76fd8a4ea746ccd7bcec69526c0a))
- Generate release notes automatically from commit history and reject empty release changelogs.

## [0.2.3] - 2026-11-09

### Changed

- **release:** enhance release workflow with coordination steps (#18) ([ad0242a](https://github.com/dumbdiagrams/dumb-diagrams/commit/ad0242a5dc0ad9db91da132e915134b6b33921a7))
- **ci:** speed up CI and add CLI update notice (#16) ([539efd1](https://github.com/dumbdiagrams/dumb-diagrams/commit/539efd1cbf48a7f5b9ea95b3e8e8bcb53ddf952f))

## [0.2.2] - 2026-11-09

### Changed

- **release:** automate release flow (#14) ([9c47285](https://github.com/dumbdiagrams/dumb-diagrams/commit/9c472851033d655b3766a5101b627f0ac5a9bdd0))
- **cli:** instruction-cli-minor-fix (#13) ([b7c5c97](https://github.com/dumbdiagrams/dumb-diagrams/commit/b7c5c97795dedb95a2830fa425d2c8251eb326aa))

## [0.2.1] - 2026-11-08

### Added

- Add a static hosted Studio build with browser onboarding, privacy details,
  and an optional guided tour.
- Add Studio documentation and license-credit links, plus drag-and-drop
  `.dgm` import.
- Recommend hosted Studio in the CLI while keeping the bundled local Studio.

### Changed

- Improve manual diagram recovery, custom item naming, provider grammar
  feedback, and save, help, and recycle-bin interactions.
- Remove URL-sharing export and keep diagram privacy commitments visible in
  Studio and the website.

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
