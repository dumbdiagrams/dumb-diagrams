# Release, deployment, and rollback

## Release

From a clean branch, update the workspace package versions and the changelog,
then run:

```bash
pnpm install --frozen-lockfile
pnpm check:release
```

`check:release` runs version sync, tests, build, editor typecheck, example
validation, and the publishable package smoke test.

Build the standalone npm artifact from the compiled workspace:

```bash
pnpm --filter dumbdiagrams run prepare:standalone
mkdir -p .artifacts
pnpm --dir packages/cli pack --pack-destination ../../.artifacts
```

The resulting tarball contains the CLI, bundled diagram runtime, and compiled
Studio assets. Publishing that package makes the end-user flow work without
shipping the repository source:

```bash
npx dumbdiagrams@0.1.0 init --open-editor
npx dumbdiagrams@latest init --open-editor
```

### Private testing before publish

Recommended: pack locally and exercise the exact consumer boundary:

```bash
pnpm build
mkdir -p .artifacts
pnpm --dir packages/cli pack --pack-destination ../../.artifacts
ARTIFACT="$(pwd)/.artifacts/dumbdiagrams-0.1.0.tgz"
npx --yes --package="$ARTIFACT" dumbdiagrams init ./preview-project --yes
npx --yes --package="$ARTIFACT" dumbdiagrams validate ./preview-project/diagrams
```

This never uploads anything to npm.

The unscoped `dumbdiagrams` package name is always public on npm. For a
registry-only private preview you need a paid npm account and a scoped package
such as `@your-name/dumbdiagrams-preview` published with `--access restricted`.

Before the first publish, confirm npm authentication and package name ownership:

```bash
npm login
npm view dumbdiagrams version
```

### Public usage after publish

```bash
# One-off commands
npx dumbdiagrams@latest init --open-editor
npx dumbdiagrams@latest studio diagrams
npx dumbdiagrams@latest validate diagrams
npx dumbdiagrams@latest render diagrams/my-diagram.dgm --output renders/my-diagram.svg

# Optional global install (exposes dumbdiagrams and dgm)
npm install -g dumbdiagrams
dumbdiagrams init --yes
dgm studio diagrams
```

Create and push the release tag only after `pnpm check:release` passes:

```bash
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

The tag starts the GitHub Pages deployment workflow in
`.github/workflows/deploy.yml`. It builds the selected tag and publishes
`packages/editor/dist` as the static site.

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

## Future website and docs

Keep plain pnpm workspaces. Add a future private Astro app as
`packages/docs` rather than introducing Nx or Turborepo until CI build time
becomes a measured bottleneck. Use a separate docs build/deploy workflow so
landing-page changes do not force npm packaging or Studio deployment.
