# Versioning and release

## Package versions

The current workspace version is `0.1.0` (release tag `v0.1.0`).

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
Publish with npm 11.5.1 or newer for OIDC support. Before creating a release
tag, configure repository protections and the `npm-production` environment;
the workflow's environment name alone does not require anyone's approval.

1. Bump every `packages/*/package.json` to the same version and update the
   current version and release tag above.
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
5. Complete the first-publish setup below if the package does not exist yet.
   Otherwise verify that its trusted publisher names the current repository,
   `publish-cli.yml`, and `npm-production` exactly, with direct `npm publish`
   permission enabled.
6. Tag the approved default-branch commit and push once branch CI is green:

   ```bash
   git tag -a "v$VERSION" -m "Release v$VERSION"
   git push origin "v$VERSION"
   ```

The release-ref guard requires the tag to match the checked-out commit and
belong to the fetched remote default branch's history (`origin/HEAD`, with
`origin/main` or `origin/master` as fallbacks). It fails if no trusted remote
branch is available. Keep `fetch-depth: 0` in release checkouts. Restrict release
tag creation in GitHub as well; source-level checks do not replace that rule.

For a new version, the tag triggers the npm publishing workflow:

- `.github/workflows/publish-cli.yml` checks that the tag matches
  `packages/cli/package.json` and reruns `pnpm check:release`. It then packs
  and smoke-tests one tarball, publishes that exact file with npm trusted
  publishing and provenance, and polls npm until the registry integrity
  matches. The job runs in the protected `npm-production` environment, and no
  npm token is stored.

The public landing page and documentation are a separate static Astro build at
`packages/website/dist`, hosted on Cloudflare Pages. Connect the repository to
Pages and use `main` as the production branch; website deployments follow branch
updates independently of npm release tags. See the
[website hosting instructions](../packages/website/README.md) for build settings.
GitHub Pages deployment and rollback workflows have been removed. Studio remains
available locally through the npm CLI.

## First publish and trusted publisher setup

Create an npm account with 2FA, then authenticate locally and check ownership:

```bash
npm login --registry=https://registry.npmjs.org
pnpm preflight:publish
```

The preflight uploads nothing and cannot reserve an available package name.
Recheck availability immediately before publishing. If another account owns
the name, stop and choose a name you control.

Trusted publishing configuration needs an existing package. If this is a new
package, complete the gate and artifact preparation above, inspect the tarball
contents with `tar -tzf "$ARTIFACT"`, then publish that reviewed artifact
interactively from your trusted machine:

```bash
npm publish "$ARTIFACT" --access public --registry=https://registry.npmjs.org/
```

This is a real public release and requires your npm authentication and 2FA.
Do not put the resulting login credential into GitHub. In the package settings,
add a GitHub trusted publisher for the exact owner/repository, workflow filename
`publish-cli.yml`, and environment `npm-production`. Enable direct `npm publish`
for the existing workflow; a publisher that only permits staging will not work
with it. Choose **Require two-factor authentication and disallow tokens** for
publishing access. Validate the new trust configuration promptly; npm currently
expires unused new configurations after two days.

The first local publish consumes that version permanently. Configure and test
OIDC with the next version; do not rerun the workflow to publish the same version.
GitHub provenance for subsequent OIDC releases requires a public source repository
and public package. Make the repository public before relying on the workflow's
`--provenance` publishing path.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/), and
[publishing a public package](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).

## Rollback

Roll back the website to a known-good deployment in the Cloudflare Pages dashboard.
A bad npm version is handled separately with `npm deprecate`; a website rollback
does not change the npm registry.

## Workflow maintenance

- Third-party actions are pinned to full commit SHAs with a version comment.
  To upgrade one, resolve the tag to its commit and review its permissions.
- Dependabot opens grouped weekly npm and Actions updates.
- `pnpm check:advisories` blocks high-severity advisories across production,
  development, and build dependencies.
- The workspace pins Node and pnpm, enforces a 24-hour minimum release age for
  packages, and allows lifecycle scripts only for `esbuild`.
