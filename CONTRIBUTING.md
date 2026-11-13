# Contributing

Contributions are welcome under the repository's AGPL-3.0-only license. Keep
the project local-first: no telemetry, remote asset fetches, or new network
dependencies without a design review and user-facing consent.

## Setup

Use the Node.js version in `.nvmrc` (24) and the pnpm version pinned in
`package.json`:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build        # catalog, runtime, editor, CLI
pnpm dev          # Studio with hot reload at http://localhost:5174
pnpm dev:cli      # the compiled CLI's Studio server (after pnpm build)
```

pnpm uses a local isolated package store in both development and CI.

Editor tests import the built runtime, so run
`pnpm --filter @dumb-diagrams/runtime build` after changing runtime code.

## Common commands

The root scripts are ordered around these everyday workflows:

| Workflow | Command |
| --- | --- |
| Run local Studio with hot reload | `pnpm dev` |
| Run the website and local Studio | `pnpm dev:website` |
| Run the built CLI's Studio server | `pnpm build && pnpm dev:cli` |
| Run all unit and integration tests | `pnpm test` |
| Run Studio browser tests | `pnpm build && pnpm test:e2e` |
| Run the full release and website gate | `pnpm check:release` |

For only the website's diagnostics, production build, and site tests, use
`pnpm check:website`. Run `pnpm check:website:ci` to also test the
analytics-enabled subdirectory build used in CI.

## Tests

| Command | Runs |
| --- | --- |
| `pnpm test` | All Vitest suites: runtime, editor model and state, CLI, integration, compat corpus |
| `pnpm exec vitest run <path>` | One file or folder, e.g. `pnpm exec vitest run packages/runtime/src/dsl` |
| `pnpm test:coverage` | Vitest with coverage, then the floors in `scripts/check-coverage.mjs` |
| `pnpm test:e2e` | Playwright on Chromium (the release browser) against the built editor |
| `pnpm exec playwright test e2e/<name>.spec.ts` | One Playwright spec |
| `pnpm test:e2e:compat` | Best-effort WebKit pass; not a release gate |
| `pnpm typecheck` | Editor TypeScript (runtime and CLI are typechecked by their builds) |
| `pnpm check:pr` | Fast PR gate: versions, Biome lint, import boundaries, Result ESLint, editor typecheck (~1 min) |
| `pnpm fix:style` | Apply Biome safe fixes on tracked paths (same scope as `check:style`) |
| `pnpm check:style` | Biome lint in CI mode (no writes) |
| `pnpm check:results` | ESLint rules for `Result` boundaries and unsafe unwraps |
| `pnpm check:dependencies` | Workspace import boundaries and dependency direction |
| `pnpm check:engine` | Engine-independent semantic/quality contracts and full-output repeatability across processes/locales/time zones |
| `pnpm test:golden` | Frozen SVG, geometry, format compatibility, and editor operation output |

After `pnpm install`, [Husky](https://typicode.github.io/husky/) installs the
Git hooks from `.husky`: **pre-commit** runs `biome check --staged` (run
`pnpm fix:style` to fix) and **pre-push** runs `pnpm check:pr`, the Chromium
Studio browser suite, and `pnpm check:website:ci`. Install Chromium first with
`pnpm exec playwright install chromium`. CI checks the
pull request title for the scoped Conventional Commit format used by squash
merges. For example: `fix(studio): allow Azure items on an empty canvas` or
`chore(docs): clarify local Studio setup`. Individual branch commits can use
any message. Set `HUSKY=0` to bypass hooks once. If your Git client (a GUI or
IDE) cannot find `pnpm` or Node, put your version manager's setup in
`~/.config/husky/init.sh`, for example
`eval "$(fnm env --shell bash)" && fnm use`.

CI runs two chains that you can run locally too: `pnpm ci:verify` (style,
dependencies, advisories, build, coverage, typecheck, examples, routing,
performance, package smoke, asset budgets) and `pnpm ci:e2e`.
`pnpm check:release` runs both plus the website checks.

## Focused testing workflows

See [docs/TESTING.md](docs/TESTING.md) for the golden set, local engine checks,
and manual packed-CLI install. `pnpm test:e2e:packed` runs the packed CLI's
Studio journey; set `DUMB_DIAGRAMS_ARTIFACT=/abs/path.tgz` to test a specific
tarball. See [docs/RELEASE.md](docs/RELEASE.md) for the release gate.

## Baselines

Several checks compare against checked-in baselines. Update one only after
reviewing why it changed; never edit a baseline just to turn CI green.

| Baseline | Update with | Review |
| --- | --- | --- |
| SVG goldens (`tests/**/__snapshots__/*.svg`) | `pnpm exec vitest run -u <test>` | Open the old and new SVG and compare them |
| Editor operation goldens (`packages/editor/src/__snapshots__/editor-model/`) | `pnpm exec vitest run -u packages/editor/src/editor-model.golden.test.ts` | Each `.dgm` diff is the source an operation writes |
| Layout contracts (`examples/layout-contracts.json`) | `pnpm update:layout-contracts` | Geometry changes for the approved examples |
| Routing warnings (`examples/routing-warnings.json`) | Edit by hand | Inspect the diagram; every entry needs a `reviews[]` note |
| Readability (`tests/fixtures/readability/baseline.json`) | `node scripts/check-readability.mjs --update` | Render the hard fixtures; stable fixtures must not change |
| Routing work counters (`scripts/performance-baseline.json`) | `node scripts/check-performance-budget.mjs --update` | CI fails when a counter grows more than 25% |

In CI, a missing snapshot fails instead of being written.

Files under `tests/compat/v<N>/` are a frozen corpus for format version N.
Never edit them; add a new file instead.

For an engine change:

1. Run `pnpm check:engine` before and after. It covers approved examples,
   engine fixtures, versioned compatibility fixtures, and a locale probe.
   Compilation must not mutate its inputs. Full geometry, SVG, and diagnostics
   must repeat exactly; the check never rounds coordinates or updates baselines.
2. Run `pnpm test:golden` to identify intentional output changes, and
   `pnpm check:routing` / `pnpm check:performance` for reviewed warnings and
   deterministic work counters. A different algorithm may need different work
   counters; review those separately from output quality.
3. Inspect old and new SVGs before accepting changed goldens. Quality contracts
   allow different coordinates and fewer soft findings, but reject missing
   entities/routes, invalid geometry, hard findings, and increased findings of
   any code. Per-code ceilings cannot judge visual balance or authorize a new
   crossing just because another crossing disappeared.

Each approved bundle needs its `requirements.json` and a layout contract;
coverage tests reject omissions. When a regression needs a new graph,
add a small named fixture or focused test instead of expanding one kitchen sink.

## Catalog

Provider icons and rules come from `assets/catalog/`. Never hand-edit the
generated manifests or staged icons. Change the inputs, then run
`pnpm catalog:generate` and `pnpm icons:check`. See
[assets/catalog/README.md](assets/catalog/README.md). New icons need their
license notice in `ICON-NOTICES.md`.

## Code conventions

Keep runtime model/layout/routing separate from platform I/O and React state.
Use public workspace exports; `pnpm check:dependencies` checks import direction.
Expected failures use local neverthrow `Result` / `ResultAsync` error unions.
Compose or propagate errors; consume them where the CLI or UI reports them.
Adapt platform exceptions once, and defer callback invocation inside the
ResultAsync boundary when it can throw synchronously. Do not use unsafe unwraps
or introduce exceptions for domain control flow. See
[Architecture](docs/ARCHITECTURE.md#error-handling) for the boundary conventions.

Keep changes focused. Split modules by responsibility when it reduces coupling;
avoid generic plugin layers, global error registries, or file splits without a
concrete need. Document lasting decisions in the existing technical references,
not per-change design documents or audit logs.

## Pull requests

- Start with a GitHub issue describing the bug or proposed change. Wait for a
  maintainer to acknowledge the issue before spending time on a pull request;
  unrequested or unconnected pull requests may be closed without review.
- Only invited contributors should submit code changes. A maintainer may invite
  someone to work on an issue or open a pull request when their help is wanted.
- The project owner must approve contributor-authored pull requests before
  they are merged. Passing CI or receiving another review does not replace
  that approval. For an owner-authored pull request, configure an explicit
  exception, such as approval by a designated trusted reviewer or a narrow
  owner bypass. Only the owner and explicitly designated maintainers may merge.
- Keep each change focused, and describe the user-visible behavior and any
  compatibility impact.
- A behavior change lands with its test. Parser, validation, rendering, CLI, and
  security changes always need one.
- Syntax changes follow the format policy in
  [docs/RELEASE.md](docs/RELEASE.md#source-format-policy).
- New dependencies need a reason. Prefer platform APIs and existing packages.
- Use public package exports between workspace packages, and keep runtime and
  editor production code browser-compatible.
- Never commit generated output: coverage, traces, tarballs, or staged catalog
  files. They belong under `.artifacts/` or ignored build folders.
- Keep secrets and private infrastructure details out of fixtures, logs, and
  screenshots.

Only maintainers publish `create-dumb-diagrams`, through the tag-driven
workflow in [docs/RELEASE.md](docs/RELEASE.md).

### Workflow and merge settings

Repository settings must match this policy: keep issues public and set pull
request creation to **Collaborators only** under Settings → General → Features.
Require approval for workflow runs
from all outside contributors, then have a maintainer approve runs from invited
trusted contributors; protect the default branch with required pull-request
review and required CI checks. The `CODEOWNERS` rule assigns all files to
`@AlexJohnSadowski`; enable required code-owner review. A broad list
of code owners would let any listed person satisfy the review. Configure any
owner-authored PR exception explicitly. Invite trusted contributors through
repository access settings and grant merge permission only to the owner and
designated maintainers. These controls live in GitHub settings; workflow files
cannot enforce them. The code owner must retain write access to the repository.

For clean `main` history, allow **squash merging only** under Settings → General
→ Pull Requests, and set the default squash message to the pull request title.
Disable merge commits and rebase merging. Require pull requests and the
`ci-required` and **Conventional PR title** checks on the default branch. The
title check runs when a PR opens, changes title, reopens, or receives new
commits. It ensures each squash commit on `main` has a scoped Conventional
Commit subject; individual commits in the pull request are not checked.
Existing commit messages remain unchanged; rewriting already-published `main`
history requires a coordinated force-push and can disrupt tags and clones.

## Project communication

Use GitHub Issues for bug reports, feature requests, documentation corrections,
project questions, and other discussion. Choose the matching form when one fits;
use **Question, documentation, or other** for everything else. Issues are public.
Remove credentials, customer data, and private infrastructure details from
diagrams, logs, and screenshots.

Report unpatched security vulnerabilities privately through GitHub as described
in [SECURITY.md](SECURITY.md). By participating, you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).
