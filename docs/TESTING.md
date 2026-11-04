# Testing

Use Node.js from `.nvmrc` and the pinned pnpm version.

```bash
corepack enable
pnpm install --frozen-lockfile
```

## Engine and golden set

- `tests/compat/v1/` freezes format compatibility.
- `examples/curated/` holds provider and cloud-agnostic cases. Semantic expectations are in `examples/evaluations/`; layout contracts and SVG snapshots freeze geometry and output.
- `examples/routing-warnings.json` and `scripts/performance-baseline.json` track routing findings and work.
- Editor operation goldens are under `packages/editor/src/__snapshots__/editor-model/`.

Run the focused checks:

```bash
pnpm check:engine
pnpm test:golden
pnpm check:routing
pnpm check:performance
```

Review changed SVGs before updating a golden or baseline. See [CONTRIBUTING.md](../CONTRIBUTING.md#baselines) for update commands and review rules.

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

`publish:metadata` needs `remote.origin` or `GITHUB_REPOSITORY=OWNER/REPO`; it writes package URLs but does not publish. The global install replaces any existing `create-dumb-diagrams` install. For automated package checks, run `pnpm smoke:package`; for the release gate, see [RELEASE.md](RELEASE.md).
