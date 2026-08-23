# Release, deployment, and rollback

## Release

From a clean branch, update all ten package versions and the changelog, then
run:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm check
```

Create and push the release tag only after those checks pass:

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

The tag starts the GitHub Pages deployment workflow in
`.github/workflows/deploy.yml`. It builds the selected tag and publishes
`packages/editor/dist` as the static site.

## Rollback

The rollback workflow is deliberately tag-based and does not mutate the
repository. In GitHub Actions, run **Rollback editor deployment**, enter a
known-good previous tag such as `v1.0.0`, and approve the deployment. The
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
