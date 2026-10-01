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

Editor tests import the built runtime, so run
`pnpm --filter @dumb-diagrams/runtime build` after changing runtime code.

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
| `pnpm check:style` | Biome formatting and lint |
| `pnpm check:results` | Every neverthrow `Result` is consumed; no unsafe unwraps in production code |

CI runs two chains that you can run locally too: `pnpm ci:verify` (style,
dependencies, advisories, build, coverage, typecheck, examples, routing,
performance, package smoke, asset budgets) and `pnpm ci:e2e`.
`pnpm check:release` runs both plus the website checks.

## Testing the packed artifact locally

The npm package is the product, so test the tarball, not the workspace:

```bash
pnpm build
pnpm smoke:package
```

`smoke:package` packs `packages/cli` into
`.artifacts/packages/create-dumb-diagrams-<version>.tgz`, installs it into a
temporary project, and runs `init`, `validate`, `format`, `render`, the `dgm`
alias, and a rebuild of the bundled corresponding source. To try the tarball by
hand:

```bash
TMP="$(mktemp -d)" && cd "$TMP"
npm init -y >/dev/null
npm install /path/to/repo/.artifacts/packages/create-dumb-diagrams-0.1.0.tgz
npx dumbdiagrams init
cd dumb-diagrams-*
npx dumbdiagrams validate .dumbdiagrams/examples/*/diagram.dgm
npx dumbdiagrams studio
```

`pnpm test:e2e:packed` drives the packed CLI's Studio server through
Playwright. Set `DUMB_DIAGRAMS_ARTIFACT=/abs/path.tgz` to smoke-test a specific
tarball, such as a release candidate (see [docs/RELEASE.md](docs/RELEASE.md)).

## Baselines

Several checks compare against checked-in baselines. Update one only after
reviewing why it changed; never edit a baseline just to turn CI green.

| Baseline | Update with | Review |
| --- | --- | --- |
| SVG goldens (`tests/**/__snapshots__/*.svg`) | `pnpm exec vitest run -u <test>` | Open the old and new SVG and compare them |
| Editor operation goldens (`packages/editor/src/__snapshots__/editor-model/`) | `pnpm exec vitest run -u packages/editor/src/editor-model.golden.test.ts` | Each `.dgm` diff is the source an operation writes |
| Layout contracts (`examples/layout-contracts.json`) | `pnpm update:layout-contracts` | Geometry changes for the curated examples |
| Routing warnings (`examples/routing-warnings.json`) | Edit by hand | Inspect the diagram; every entry needs a `reviews[]` note |
| Routing work counters (`scripts/performance-baseline.json`) | `node scripts/check-performance-budget.mjs --update` | CI fails when a counter grows more than 25% |

In CI, a missing snapshot fails instead of being written.

Files under `tests/compat/v<N>/` are a frozen corpus for format version N.
Never edit them; add a new file instead.

## Catalog

Provider icons and rules come from `assets/catalog/`. Never hand-edit the
generated manifests or staged icons. Change the inputs, then run
`pnpm catalog:generate` and `pnpm icons:check`. See
[assets/catalog/README.md](assets/catalog/README.md). New icons need their
license notice in `ICON-NOTICES.md`.

## Pull requests

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
