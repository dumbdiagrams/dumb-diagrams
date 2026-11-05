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
