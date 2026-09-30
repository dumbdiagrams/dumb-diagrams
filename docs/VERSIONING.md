# Versioning strategy

DumbDiagrams uses Semantic Versioning for its workspace packages:

- `MAJOR` changes may break the `.dgm` grammar, document model, public package
  APIs, renderer output contract, or supported deployment behavior.
- `MINOR` changes add backwards-compatible grammar, APIs, formats, editor
  capabilities, or catalog features.
- `PATCH` changes fix bugs, improve rendering, or update implementation details
  without changing the compatibility contract.

The packages are versioned and released together so a parsed document, layout,
router, renderer, CLI, and editor always share one compatibility line. The
editor package remains private for distribution purposes, while the public
`create-dumb-diagrams` package is the end-user distribution. The repository root is a
workspace container and is not independently versioned.

Release requirements:

1. Update every `packages/*/package.json` version to the same value.
2. Add a dated entry to [CHANGELOG.md](../CHANGELOG.md).
3. Run `pnpm check:release`.
4. Prepare the metadata-bearing CLI artifact with
   `GITHUB_REPOSITORY=OWNER/REPO pnpm publish:metadata` (the script also reads
   `remote.origin` when available), then run the exact artifact smoke test.
5. Run `pnpm preflight:publish` against the public npm registry.
6. Create an annotated `vMAJOR.MINOR.PATCH` tag only after CI passes.
7. Publish the exact tarball that passed the smoke test and deploy the editor
   from that same tag. The publish workflow repeats `pnpm check:release` on the
   tag and verifies the version is visible on npm after publishing.

During the `0.x` series, the `.dgm` format is stable within each minor release
line. Patch releases must remain backward compatible. A breaking grammar or
model change requires the next minor version, a migration note, and an updated
example corpus. The project may adopt a stronger v1 compatibility promise once
the format has public usage history.

Chromium is the release browser target. WebKit runs the compatibility suite;
Firefox and native Safari do not define the release support promise.
