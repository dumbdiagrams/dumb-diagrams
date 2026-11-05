# Testing

Use Node.js from `.nvmrc` and the pinned pnpm version.

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Engine and golden set

- `tests/compat/v1/` freezes format compatibility.
- `examples/curated/` holds provider and cloud-agnostic cases. Semantic expectations are in `examples/evaluations/`; layout contracts and SVG snapshots freeze geometry and output.
- Every maintained diagram has `requirements.json` (bundles) or `<stem>.requirements.json` (flat files). These contracts freeze component IDs, relationships, counts, and placement from the prompt before authoring.
- `examples/routing-warnings.json` and `scripts/performance-baseline.json` track routing findings and work.
- Editor operation goldens are under `packages/editor/src/__snapshots__/editor-model/`.
- `tests/fixtures/automatic-quality/` freezes 16 Luna 6 inputs. Keep their prompts, sources and contracts unchanged. Their replay requires visible connections, clear captions, compact simple flows and deterministic output. Ordinary crossings use plain lines and remain reported; collisions and shared corridors are not accepted.

Run the focused checks:

```bash
pnpm check:engine
pnpm test:golden
pnpm check:routing
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

`check:engine` checks contract coverage, positive examples, and deliberately
incomplete Composer outputs under `examples/evaluations/incomplete-composer/`.
The full hard candidates must pass completeness even while routing findings
remain. Historical SVGs and their hashes are preserved.

## Reviewed Studio exports

`examples/reviewed/manifest.json` records the historical app version, dimensions, and SHA-256 for each original export. The website copies those SVGs byte-for-byte alongside their metadata-extracted `.dgm` source and frozen prompt; it does not compile them with the current engine. The docs gallery displays provider and historical version on every example.

`pnpm test:golden` also renders those archived sources against separate SVG snapshots to detect engine changes. Review notes in the manifest record known visual polish issues.

[`examples/review-candidates/`](../examples/review-candidates/README.md) contains one hard prompt per provider for the next manual pass. These candidates have routing findings and are outside the accepted baselines.

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
