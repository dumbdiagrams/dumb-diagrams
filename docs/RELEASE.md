# Versioning and release

## Package versions

All workspace packages share one version, bumped together, so the parser,
renderer, CLI, and editor are always one compatibility line. Only
`create-dumb-diagrams` is published; the others are bundled into it.

The project follows Semantic Versioning. During `0.x`, a minor release may
break things, but only as described in the format policy below; patch
releases never break anything.

## Source format policy

Every `.dgm` file may start with `dgm <N>`. A file without that line is
format 1. The parser rejects a newer format with "This diagram uses format N;
this dumbdiagrams supports format 1. Upgrade dumbdiagrams." It never guesses.

- **Additive syntax** (a new keyword, value, or type) stays on the same format
  and ships in a minor release. Add it to `DGM_KEYWORDS` or `DGM_VALUES` in
  `dsl/parse.ts`, cover it in a new `tests/compat/v1/` file, and document it in
  the website `source-format.md`. The keyword drift test fails until all three
  are done.
- **A breaking change** (removing or changing the meaning of syntax) requires
  a new format number:
  1. Bump `DGM_FORMAT_VERSION` and keep a parse path for every older format.
  2. Add `tests/compat/v<N>/` and leave every older `tests/compat/v*/` file
     untouched: those files and their SVG snapshots must keep passing.
  3. Write a migration note in the CHANGELOG under a **Format** heading.
  4. Have `printDgm` write the new `dgm <N>` header.
- **Renaming a catalog type:** keep the old name as an alias that emits a
  `deprecated-type` warning for at least one minor release. Remove the alias
  only with the next format version.

Validation warnings may be added in any minor release. Error codes and warning
codes are stable: if a rule is replaced, use a new code, as
`managed-service-in-network` replaced `regional-in-vpc`.

## Release checklist

Use the Node.js version from `.nvmrc` and the pnpm version from `package.json`.

1. Bump every `packages/*/package.json` to the same version.
2. Move the `Unreleased` entries in `CHANGELOG.md` under the new version and
   date.
3. Run the full gate:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check:release
   ```

   This runs `ci:verify`, Playwright on Chromium (`ci:e2e`), and the website
   checks. Optionally also run `pnpm test:e2e:compat` for WebKit.
4. Build and smoke-test the exact artifact that will be published:

   ```bash
   export GITHUB_REPOSITORY=OWNER/REPO   # or let the script read remote.origin
   pnpm publish:metadata
   pnpm --filter create-dumb-diagrams run prepare:standalone
   mkdir -p .artifacts/packages
   pnpm --dir packages/cli pack --pack-destination ../../.artifacts/packages
   VERSION="$(node -p 'require("./packages/cli/package.json").version')"
   ARTIFACT="$(pwd)/.artifacts/packages/create-dumb-diagrams-$VERSION.tgz"
   DUMB_DIAGRAMS_ARTIFACT="$ARTIFACT" pnpm smoke:package
   ```

   None of this uploads anything.
5. Before the first publish only, run
   `npm login --registry=https://registry.npmjs.org` and then
   `pnpm preflight:publish`. The preflight rejects a package name owned by
   another account.
6. Tag and push once branch CI is green:

   ```bash
   git tag -a "v$VERSION" -m "Release v$VERSION"
   git push origin "v$VERSION"
   ```

The tag triggers two workflows:

- `.github/workflows/publish-cli.yml` checks that the tag matches
  `packages/cli/package.json` and reruns `pnpm check:release`. It then packs
  and smoke-tests one tarball, publishes that exact file with npm trusted
  publishing and provenance, and polls npm until the registry integrity
  matches. The job runs in the protected `npm-production` environment, and no
  npm token is stored.
- `.github/workflows/deploy.yml` reruns the gate against the tag and publishes
  `packages/editor/dist` to GitHub Pages.

## Rollback

Run **Rollback editor deployment** in GitHub Actions with a known-good tag. It
rebuilds and redeploys that ref through the same Pages environment, without
changing the repository. A bad npm version is handled separately with
`npm deprecate`; a site rollback does not touch the registry.

## Workflow maintenance

- Third-party actions are pinned to full commit SHAs with a version comment.
  To upgrade one, resolve the tag to its commit and review its permissions.
- Dependabot opens grouped weekly npm and Actions updates.
- `pnpm check:advisories` blocks high-severity production advisories.
- The workspace pins Node and pnpm, enforces a 24-hour minimum release age for
  packages, and allows lifecycle scripts only for `esbuild`.
