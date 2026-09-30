# Release, deployment, and rollback

## Release

Use the exact Node.js version from `.nvmrc` and the pinned pnpm version from
`packageManager` in the root `package.json`. From a clean branch, update the
workspace package versions and the changelog, then run:

```bash
pnpm install --frozen-lockfile
pnpm check:release
```

`check:release` starts with the repository Biome formatting/lint gate, then runs
catalog inventory, version sync, dependency checks, build, unit/integration
tests with a coverage report, editor typecheck, example validation, routing
checks, Chromium Studio journeys, the packed-package smoke test, the production
dependency advisory check, and website checks. WebKit compatibility runs
separately with `pnpm test:e2e:compat`; Firefox and native Safari are not release
gates.

Prepare the publish metadata and build the standalone npm artifact from the
compiled workspace. CI sets `GITHUB_REPOSITORY` automatically; locally, set it
to the canonical `OWNER/REPO` value or let the script read `remote.origin`:

```bash
export GITHUB_REPOSITORY=OWNER/REPO
pnpm publish:metadata
pnpm --filter create-dumb-diagrams run prepare:standalone
mkdir -p .artifacts/packages
pnpm --dir packages/cli pack --pack-destination ../../.artifacts/packages
VERSION="$(node -p 'require("./packages/cli/package.json").version')"
ARTIFACT="$(pwd)/.artifacts/packages/create-dumb-diagrams-$VERSION.tgz"
DUMB_DIAGRAMS_ARTIFACT="$ARTIFACT" pnpm smoke:package
```

The resulting tarball contains the CLI, bundled diagram runtime, compiled
Studio assets, and the AGPL corresponding-source snapshot. Publishing it makes
the end-user flow work without requiring a repository checkout:

```bash
npm install -g create-dumb-diagrams@0.1.0
dumbdiagrams init
dumbdiagrams studio
```

### Private testing before publish

Recommended: pack locally and exercise the exact consumer boundary:

```bash
pnpm build
export GITHUB_REPOSITORY=OWNER/REPO
pnpm publish:metadata
pnpm --filter create-dumb-diagrams run prepare:standalone
mkdir -p .artifacts/packages
pnpm --dir packages/cli pack --pack-destination ../../.artifacts/packages
VERSION="$(node -p 'require("./packages/cli/package.json").version')"
ARTIFACT="$(pwd)/.artifacts/packages/create-dumb-diagrams-$VERSION.tgz"
DUMB_DIAGRAMS_ARTIFACT="$ARTIFACT" pnpm smoke:package
```

This never uploads anything to npm.

The unscoped `create-dumb-diagrams` package name is always public on npm. For a
registry-only private preview you need a paid npm account and a scoped package
such as `@your-name/create-dumb-diagrams-preview` published with `--access restricted`.

Before the first publish, authenticate to the public npm registry and run the
repository preflight. It rejects an existing package owned by another account:

```bash
npm login --registry=https://registry.npmjs.org
pnpm preflight:publish
```

Publish the exact tarball that passed the local consumer-boundary checks, not a
freshly packed directory:

```bash
npm publish "$ARTIFACT" --access public --registry=https://registry.npmjs.org/
```

Confirm the new version is visible before moving the `latest` documentation and
deployment forward:

```bash
npm view "create-dumb-diagrams@$VERSION" version --registry=https://registry.npmjs.org/
```

### Public usage after publish

```bash
# Install once, then use the canonical command
npm install -g create-dumb-diagrams
dumbdiagrams init
dumbdiagrams studio

# Convenience shorthand
dgm init
dgm studio
```

Create and push the release tag only after `pnpm check:release`, the exact
metadata-bearing artifact smoke test, `pnpm preflight:publish`, and branch CI
pass. The tag workflow publishes the same artifact only after rerunning the
full release gate and verifying the package on npm:

```bash
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

The tag starts the GitHub Pages deployment workflow in
`.github/workflows/deploy.yml`. A new release tag repeats the full Linux release
verification against that exact ref and only then publishes
`packages/editor/dist` as the static site. An explicit rollback ref is already
a known-good release, so it is rebuilt and deployed without assuming that an
older tag contains today's test scripts. Normal CI also runs the packed CLI
smoke on Windows so path handling and Windows package preparation cannot drift.

The same tag also starts `.github/workflows/publish-cli.yml`. Configure npm's
trusted publisher for the exact workflow filename and the protected
`npm-production` environment before the first release. The workflow grants only
read access plus the job-scoped OIDC identity permission, verifies that the
exact tag exists and matches `packages/cli/package.json`, installs with the
frozen lockfile, runs the complete `pnpm check:release`, applies the same
metadata script, packs and smoke-tests one exact tarball, and publishes that
file with provenance. It then polls npm until the version is visible and its
registry integrity matches that exact tarball. A manual run must name an existing `vMAJOR.MINOR.PATCH` tag; it does
not publish the current branch. There is no long-lived npm token in the
workflow.

## Rollback

The rollback workflow is deliberately tag-based and does not mutate the
repository. In GitHub Actions, run **Rollback editor deployment**, enter a
known-good previous tag such as `v0.1.0`, and approve the deployment. The
reusable deployment job checks out exactly that ref, rebuilds it, and publishes
it through the same Pages environment.

If a package release also needs to be reverted, do that separately with the
package registry's yanked/deprecation procedure; a static-site rollback does
not rewrite published package versions.

## Deployment policy

- CI is required for pull requests and pushes to the default branch.
- Production editor deployments come from version tags or an explicitly chosen
  rollback tag.
- The Pages environment is serialized so a newer deployment cannot race a
  rollback.
- Build artifacts are retained by the workflow for inspection and recovery.

## Bundle check

The generated provider catalog is intentionally emitted as the cacheable
`catalog-index` chunk. The editor entry chunk should remain below the old
multi-megabyte warning range; a catalog update should not invalidate the rest
of the editor bootstrap. If the entry grows materially, investigate a new
dynamic boundary instead of increasing the warning limit.

## Repository layout

- `assets/catalog/` — vendored provider SVGs, source locks, and collision policy.
  See [`assets/catalog/README.md`](../assets/catalog/README.md).
- `examples/curated/` — canonical four-file bundles for curated AWS, Azure,
  GCP, and cloud-agnostic examples.
- `examples/diagrams/` and `examples/prompts/` — development fixtures, all
  validated by CI. Studio ships ten canonical examples: seven AWS, one Azure,
  one GCP, and one cloud-agnostic.
- `packages/brand`, `packages/runtime`, `packages/editor`, `packages/cli`, and
  `packages/website` — the five workspace packages.
- `.artifacts/` — ignored coverage, Playwright output, golden renders, and packed
  tarballs.

Generated editor catalog assets under `packages/editor/public/catalog-icons/`
are reproducible build outputs and are not committed.

## Supply-chain policy

The workspace pins Node and pnpm exactly, uses isolated linking, strict peer and
engine checks, a 24-hour minimum package release age, and a lifecycle allowlist
that permits only reviewed `esbuild` postinstall execution. Run
`pnpm check:dependencies` after changing imports or package manifests. The
maintained CI and release workflows also run the production advisory gate;
registry alerts remain a useful second signal rather than a substitute for that
blocking check.
