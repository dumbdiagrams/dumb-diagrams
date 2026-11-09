# Versioning and release

## Package versions

The current workspace version is `0.2.3` (release tag `v0.2.3`).

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

1. Start from a clean `main` checkout and run
   `pnpm release:prepare <version>`, for example `pnpm release:prepare 0.2.2`.
   The command fast-forwards `main`, creates `chore/release-<version>`, updates
   all workspace package versions, the lockfile, release version line, and
   changelog heading. Add release notes under the new heading, review the diff,
   and open a PR to `main`. The command runs `pnpm check:versions` before and
   after preparing the files.
2. Require the release PR checks to pass before merging. Running
   `pnpm check:release` locally is optional. The tag workflow verifies that
   the exact tagged commit is on the trusted default branch and that its
   `CI` push run succeeded before preparing a package.
3. If the package already exists, verify that its trusted publisher names the
   current repository, `publish-cli.yml`, and `npm-production` exactly, with
   direct `npm publish` permission enabled. For a first publish, use the
   one-time procedure below after the preparation job creates the artifact.
4. After the release PR is merged and `main` CI is green, push the tag from a
   clean `main` checkout:

   ```bash
   git switch main
   pnpm release:tag --push
   ```

   `pnpm release:tag --push` uses the CLI package version, checks all release
   metadata, fast-forwards `main` when possible, then creates and pushes the
   matching tag. It refuses a dirty or diverged checkout. Do not type the tag
   version separately.
   If a tag's release attempt failed before the npm publish step, delete that
   failed tag before recreating it on the corrected commit; never move a tag
   that has already been published.

The release-ref guard requires the tag to match the checked-out commit and
belong to the fetched remote default branch's history (`origin/HEAD`, with
`origin/main` or `origin/master` as fallbacks). It fails if no trusted remote
branch is available. Keep `fetch-depth: 0` in release checkouts. Restrict release
tag creation in GitHub as well; source-level checks do not replace that rule.

For a new version, the tag triggers the npm publishing workflow:

- `.github/workflows/publish-cli.yml` first runs an unprivileged preparation
  job. It checks the tag and package version, verifies the exact release SHA
  against the trusted default branch and successful `CI` push run, installs
  with the pnpm cache, builds, packs, budget-checks, and smoke-tests one exact
  tarball, then uploads that tarball and its checksum as the release handoff.
- A separate publishing job downloads the handoff, verifies its checksum and
  package version, and only then enters the protected `npm-production`
  environment. That job alone has `id-token: write`; it publishes the exact
  prepared file with npm trusted publishing and provenance, then polls npm
  until the registry integrity matches. No npm token is stored in Actions.

Registry verification polls the public npm registry directly for up to 15 minutes,
with bounded requests and no local npm metadata cache. It retries propagation
404s, rate limiting, network errors, and registry outages. A visible version with
a different artifact integrity fails immediately.

If npm accepts publication but verification exhausts that window, do not rerun
publication or move the tag. Retry only verification from a checkout containing
the verifier, using the expected SHA-512 integrity from the prepared artifact
or the failed publish log:

```bash
PACKAGE_NAME=create-dumb-diagrams RELEASE_VERSION=0.1.0 \
  EXPECTED_INTEGRITY='sha512-REPLACE_WITH_EXPECTED_VALUE_FROM_RELEASE_LOG' \
  node scripts/verify-npm-release.mjs
```

This is read-only and does not publish anything. Use the integrity from the
exact uploaded release artifact or publish log, not an independently rebuilt
local tarball.

The public landing page and documentation are a separate static Astro build at
`packages/website/dist`, hosted on Cloudflare Pages. Connect the repository to
Pages and use `main` as the production branch; website deployments follow branch
updates independently of npm release tags. See the
[website hosting instructions](../packages/website/README.md) for build settings.
GitHub Pages deployment and rollback workflows have been removed. The hosted
Studio is served as a separate static app at `studio.dumbdiagrams.com`; local
Studio remains bundled in the npm CLI.

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
package, push the release tag as usual and wait for the unprivileged preparation
job to finish. Download the `npm-release-<version>` artifact from that workflow
run, cancel its waiting `publish` job, verify the checksum, and inspect the
tarball contents before publishing it interactively from your trusted machine:

```bash
artifact=create-dumb-diagrams-0.3.0.tgz # use the version from the downloaded artifact
sha256sum -c "$artifact.sha256"
tar -tzf "$artifact"
npm publish "$artifact" --access public --registry=https://registry.npmjs.org/
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
- The workspace pins Node and pnpm, enforces a 72-hour minimum release age for
  packages, and allows lifecycle scripts only for `esbuild`.
