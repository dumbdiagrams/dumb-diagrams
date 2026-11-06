# Testing

Use Node.js from `.nvmrc` and the pinned pnpm version.

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Engine and golden set

- `tests/compat/v1/` freezes format compatibility.
- `examples/approved/<model>-<date>/` holds reviewed model runs of the `examples/prompts/` bank (see [`examples/README.md`](../examples/README.md)). Layout contracts and SVG snapshots freeze their geometry and output.
- `tests/fixtures/engine/` holds older engine regression diagrams that unit and browser tests target directly.
- Every maintained diagram has `requirements.json` (bundles) or `<stem>.requirements.json` (flat files). These contracts freeze component IDs, relationships, counts, and placement from the prompt before authoring.
- `examples/routing-warnings.json` and `scripts/performance-baseline.json` track routing findings and work.
- `tests/fixtures/readability/` copies Sonnet, Luna 6, and Haiku 5.5 runs. `pnpm check:readability` fails when a `hard/` diagram gains backward or backtracking flow or crossings over `baseline.json`, and when any `stable/` SVG changes at all.
- `examples/prompts/<id>.reference.json` is the reviewed contract for each prompt: required roles by catalog type, containment, and edge direction. It does not depend on the model's own IDs or contract.
- Editor operation goldens are under `packages/editor/src/__snapshots__/editor-model/`.
- `tests/fixtures/automatic-quality/` freezes 16 Luna 6 inputs. Keep their prompts, sources and contracts unchanged. Their replay requires visible connections, clear captions, compact simple flows and deterministic output. Ordinary crossings use plain lines and remain reported; collisions and shared corridors are not accepted.

Run the focused checks:

```bash
pnpm check:engine
pnpm test:golden
pnpm check:routing
pnpm check:readability
pnpm check:performance
```

Review changed SVGs before updating a golden or baseline. See [CONTRIBUTING.md](../CONTRIBUTING.md#baselines) for update commands and review rules.

## Architecture completeness

```bash
dumbdiagrams validate diagrams/example/diagram.dgm
dumbdiagrams validate --strict diagrams/example/diagram.dgm
dumbdiagrams validate --json diagrams/example/diagram.dgm
```

Normal validation requires the companion contract and fails on source, provider,
or completeness problems. Strict validation also fails on routing findings.
Use `--requirements <path>` with a custom contract or stdin. Requirements do not
change during layout repairs; correcting extraction must be explained in the
architecture brief. The checker verifies the extracted contract, not the model's
understanding of natural language.

Validation also applies the project-root `preferences.json` (numbered steps, edge
labels, icon labels), overridden per diagram by the contract's
`preferences`. `validate --json` reports `readability`: backward and
backtracking flow edges, bends, and crossings.

## Score a model run

```bash
pnpm score:run <run-dir> --model <name> --reasoning <level> [--json score.json]
```

`<run-dir>` is an initialized project or an `examples/` run folder. Each bundle
is scored against its prompt reference, the run's preferences, its own
contract, routing findings, and flow direction; `generatedBy` from
`requirements.json` is shown next to the model you pass. The script exits 1
when any bundle misses its reference, preferences, contract, or validity.

To add a scored run to the golden set, run
`pnpm approve:run <run-dir> --model <name> --reasoning <level> [--featured] --decision "<text>"`.
It copies the run into `examples/approved/` (replacing a run of the same name)
and regenerates the SVGs, routing reviews, layout contracts, engine snapshots,
and performance budget for every approved run; review the diff. Delete a run's
folder to retire it. The featured run feeds Studio's picker and the website.

`check:engine` checks that every approved bundle satisfies its requirements
contract and that removing any required component or relationship is reported.
Hard prompts must pass completeness even while their routing findings remain
baselined.

## Test the packed CLI manually

```bash
pnpm build
pnpm publish:metadata
pnpm --filter create-dumb-diagrams run prepare:standalone
mkdir -p .artifacts/packages
pnpm --dir packages/cli pack --pack-destination ../../.artifacts/packages

VERSION="$(node -p 'require("./packages/cli/package.json").version')"
ARTIFACT="$PWD/.artifacts/packages/create-dumb-diagrams-$VERSION.tgz"
npm install -g "$ARTIFACT"

dumbdiagrams init
```

Change into the project directory printed by `init`, then run:

```bash
dumbdiagrams studio
```

After replacing the package, restart Studio and reload any existing Studio tabs.

`publish:metadata` needs `remote.origin` or `GITHUB_REPOSITORY=OWNER/REPO`; it writes package URLs but does not publish. The global install replaces any existing `create-dumb-diagrams` install. For automated package checks, run `pnpm smoke:package`; for the release gate, see [RELEASE.md](RELEASE.md).

The automated package smoke uses npm by default, including the Linux verify and
release checks. Windows CI selects `DUMB_DIAGRAMS_SMOKE_INSTALLER=pnpm` to reuse
pnpm's dependency store; both installers run the same packed CLI checks. To
exercise that path locally, run `DUMB_DIAGRAMS_SMOKE_INSTALLER=pnpm pnpm smoke:package`.
Temporary smoke projects stay under `.artifacts/packages` on the checkout's drive
so Windows can reuse the cached pnpm store during the source rebuild. The smoke
log reports source verification and package installation durations separately.
