# Versioning and release

## Package versions

The current workspace version is `0.3.1` (release tag `v0.3.1`).

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
   changelog section. Release notes are generated from commits since the previous
   reachable stable version tag, grouped by Conventional Commit type, with commit
   links. Release version-bump commits are omitted; nonconventional commits are
   retained under Changed. Existing hand-written Unreleased notes are preserved
   in the new release. Review the generated notes, edit any wording as needed,
   and open a PR to `main`. The command runs `pnpm check:versions` before and
   after preparing the files. The version check also rejects an empty current
   release section. Prefer squash merging PRs so their Conventional Commit
   titles become the commit subjects used for release notes.
2. Require the release PR checks to pass before merging. Running
   `pnpm check:release` locally is optional. The tag workflow verifies that
   the exact tagged commit is on the trusted default branch and has a successful
   `CI` push run. It reuses that result without rerunning CI.
3. If the package already exists, verify that its trusted publisher names the
   current repository, `publish-cli.yml`, and `npm-production` exactly, with
   direct `npm publish` permission enabled. For a first publish, use the
   one-time procedure below after the preparation job creates the artifact.
4. After the release PR is merged, push the tag from a
   clean `main` checkout:

   ```bash
   git switch main
   pnpm release:tag --push
   ```

   `pnpm release:tag --push` uses the CLI package version, checks all release
   metadata, fast-forwards `main` when possible, then creates and pushes the
   matching tag. It refuses a dirty or diverged checkout. Do not type the tag
   version separately.
   The tag can arrive before or after `main` CI completes. If CI is still
   running, the tag event finishes without preparing or publishing; successful
   CI completion starts another eligibility check automatically. If CI fails,
   publishing remains blocked; rerunning CI successfully resumes the release.
   For manual recovery, launch `Publish CLI package` with `workflow_dispatch`
   from `main`, passing the existing tag as `ref`. This uses the current
   coordinator while preparing the artifact from the tagged commit. An older
   tag created before this coordination workflow was installed can also be
   recovered this way once its exact commit has successful main CI.
   If the release commit itself needs correction before publication, delete
   and recreate the unpublished tag on the corrected commit. Never move a tag
   that has already been published.

The release-ref guard requires the tag to match the checked-out commit and
belong to the fetched remote default branch's history (`origin/HEAD`, with
`origin/main` or `origin/master` as fallbacks). It fails if no trusted remote
branch is available. Keep `fetch-depth: 0` in release checkouts. Restrict release
tag creation in GitHub as well; source-level checks do not replace that rule.

The release workflow handles tag pushes, completed default-branch `CI` runs,
and manual recovery:

- A read-only coordinator executes from the trusted default branch. It accepts
  only the configured publisher and successful same-repository push CI, never
  PR or fork CI. It requires the canonical version tag, matching package
  version, exact successful CI SHA, and default-branch ancestry. A tag without
  green CI or a green commit without its matching tag produces an explicit
  no-op. The later event checks both prerequisites again; no runner polls CI.
- Eligible releases run preparation with read-only permissions: build, pack,
  enforce budgets, and smoke-test one exact tarball. The tarball and checksum
  become the release handoff. Preparation and publication each have a
  30-minute job timeout; coordination has a five-minute timeout.
- The publishing job waits for the protected `npm-production` approval. After
  approval it checks the tag is unchanged, downloads the handoff, verifies
  checksum and package identity, then publishes with npm trusted publishing
  and provenance. This job alone has `id-token: write`. Registry verification
  compares the exact artifact integrity; no npm token is stored in Actions.
- The entire workflow, including the approval pause and registry verification,
  is serialized in the `npm-production` concurrency group with `queue: max`.
  Overlapping tag and CI events cannot publish concurrently. An automatic
  event for a version already present on npm exits before preparation or
  approval; this does not replace verification of a previously failed release.
  Manual recovery prepares the artifact again and, if the version exists,
  verifies its integrity instead of publishing it again. A mismatch fails.

The workflow must be merged to the default branch before CI-completion events
can invoke the coordinator. Normal PR CI and main push CI still run; the
publisher adds artifact checks without launching another full test suite.

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
