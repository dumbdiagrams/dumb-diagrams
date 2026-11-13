# Changelog

All notable changes to DumbDiagrams are documented here. The project follows
the versioning policy in [docs/RELEASE.md](./docs/RELEASE.md).

## [Unreleased]

## [0.3.1] - 2026-11-13

### Added

- **browser-compatibility:** add browser compatibility notice (#28) ([3fe1191](https://github.com/dumbdiagrams/dumb-diagrams/commit/3fe1191bd4213105b18c8acc1d865a6ff56d8f71))
- **website:** svg-improvements-for-the-social-cards-and-articles (#25) ([e1df996](https://github.com/dumbdiagrams/dumb-diagrams/commit/e1df996303ef0da26e075a5f70d5d562bb10f462))

### Changed

- **deps-dev:** bump the development group with 13 updates (#26) ([83bd454](https://github.com/dumbdiagrams/dumb-diagrams/commit/83bd454654320a9dbf77eb47ba7383cc83367538))
- **docs:** update DrawingExtractionExample and related documenta… (#24) ([0a34074](https://github.com/dumbdiagrams/dumb-diagrams/commit/0a34074eae218db4d4743d7af3e1018b35aae61f))

## [0.3.0] - 2026-11-13

### Added

- **manifest:** update source manifest to include new Playwright configurations and test paths ([3474044](https://github.com/dumbdiagrams/dumb-diagrams/commit/34740444ac4214945750883b319d090cb6c6e00e))
- **ci:** add CI checks for website and update pre-push hooks to include website tests ([dcc9a33](https://github.com/dumbdiagrams/dumb-diagrams/commit/dcc9a33494c8f73de5a16c2af9f72204915ac555))
- **website:** improve examples and interactive experience ([bdc13a2](https://github.com/dumbdiagrams/dumb-diagrams/commit/bdc13a2af538d174b7c7b0d3920295d25d4373a5))
- **studio:** expand annotation font size controls ([bad52d7](https://github.com/dumbdiagrams/dumb-diagrams/commit/bad52d79fb026d193fbf332dc904420fa813b944))
- **studio:** size notes to their text and place them beside what they describe ([a2dae1e](https://github.com/dumbdiagrams/dumb-diagrams/commit/a2dae1e597ad14b7b1de1244f9ef929ed5e17511))
- **studio:** preset pastel note themes with sky default and rose option ([df5ad24](https://github.com/dumbdiagrams/dumb-diagrams/commit/df5ad2482e10e3205314181e6093738beda65ffd))
- **studio:** live-sync and autosave linked diagram files ([5861f25](https://github.com/dumbdiagrams/dumb-diagrams/commit/5861f251b78998c499f61a2c62582ca2bf0351c8))
- **studio:** adapt chrome and side panels for narrow viewports ([2515e1c](https://github.com/dumbdiagrams/dumb-diagrams/commit/2515e1c94091be1f9d43e9e8213744525316f4a2))

### Changed

- **annotation-themes:** replace assertThemeContrast with inline contrast checks for annotation themes ([72dcde6](https://github.com/dumbdiagrams/dumb-diagrams/commit/72dcde604569b37081ecbe127fd6c2c575e56cd6))
- **studio:** rename resize fit helper ([13a1b02](https://github.com/dumbdiagrams/dumb-diagrams/commit/13a1b02b864091edcae7d5fdcc73c326a81acaa6))
- **examples:** update example loading logic and enhance landing page examples (#21) ([d0311c4](https://github.com/dumbdiagrams/dumb-diagrams/commit/d0311c4175731d5f639cc1c65e64d481d02e85ee))

### Fixed

- **contributing:** clarify pre-push checks to run only on main branch and update documentation ([7e277df](https://github.com/dumbdiagrams/dumb-diagrams/commit/7e277df0bfda003ef3e04d06b6923d037be2a110))
- **studio:** show connecting state instead of Browser only while linking a file ([0972318](https://github.com/dumbdiagrams/dumb-diagrams/commit/097231877293d2acf39f310f7171eb6a04a23408))
- **studio:** place file sync badge next to the filename ([5328a02](https://github.com/dumbdiagrams/dumb-diagrams/commit/5328a02501973aeca71a2605e5207ef6e8e0ab5c))
- **studio:** request read-write access when opening linked files ([4dbb9fb](https://github.com/dumbdiagrams/dumb-diagrams/commit/4dbb9fb638f8aebed84a2904ddea06a044555c0d))
- **studio:** edit and resize annotations directly on canvas ([67a42d9](https://github.com/dumbdiagrams/dumb-diagrams/commit/67a42d9597e8076f2ccfd094ef1d002590ebf4f9))
- **runtime:** fit and place styled annotations without clipping ([2764572](https://github.com/dumbdiagrams/dumb-diagrams/commit/2764572bfa9f9b57e9298ab71c76f0335a290758))
- **cli:** require native sequence badges for numbered flows ([63a808e](https://github.com/dumbdiagrams/dumb-diagrams/commit/63a808eee902ee0faf685af38adbce9307a5b506))

### Documentation

- **cli:** document the dgm command shorthand ([906ff7f](https://github.com/dumbdiagrams/dumb-diagrams/commit/906ff7f907b3eda1b6a4f8141b68c9e14c438da4))
- **website:** describe Studio file linking and sync in guide ([29d424c](https://github.com/dumbdiagrams/dumb-diagrams/commit/29d424c6ddd23019b1f7f575ea09790deead6397))
- **cli:** document linked file live sync and autosave ([5944437](https://github.com/dumbdiagrams/dumb-diagrams/commit/5944437422af308aa68fe28cc9f471206c0b7407))

### Tests

- **studio:** share regressions across local and hosted builds ([b44f4b5](https://github.com/dumbdiagrams/dumb-diagrams/commit/b44f4b52d00ff27ad4668af9f7d5ab428387b4a8))

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
