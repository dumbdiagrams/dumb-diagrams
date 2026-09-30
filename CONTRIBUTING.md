# Contributing

Contributions are welcome under the repository's AGPL-3.0-only license. Keep
the application local-first: do not add telemetry, remote asset fetches, or
network dependencies without an explicit design review and user-facing
consent.

## Development

Use Node.js 24 or newer and the pinned pnpm version from `package.json`:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test:unit
pnpm check:style
pnpm check:results
pnpm typecheck
```

Run the narrowest relevant package or integration test while iterating. For
Studio changes, `pnpm test:e2e` is the Chromium release gate and
`pnpm test:e2e:compat` is the best-effort WebKit pass; Firefox and native Safari
are not release gates. Before opening a release-oriented change, run
`pnpm check:release` when the required browser dependencies are available.
Never commit generated catalog or build outputs by hand; use the documented
generator and inventory checks.

## Changes and review

Keep pull requests focused, explain user-visible behavior and compatibility
impact, and include regression tests for parser, validation, rendering, CLI, or
security changes. Preserve deterministic output and stable diagnostics. Avoid
rewriting unrelated files, generated assets, or formatter baselines in a
feature change. Do not include secrets or private infrastructure data in
fixtures, logs, screenshots, or issue discussions.

Check third-party licenses and retain required notices when adding provider
icons or other assets. New dependencies need a lockfile update and an explicit
reason; prefer existing platform APIs and runtime packages.

Use the ownership and error-handling boundaries in
[the technical overview](docs/TECHNICAL_OVERVIEW.md#editor-ownership-and-failures).
Biome owns general linting; the separate Result check runs only typed
neverthrow consumption and unsafe-unwrap rules. Runtime and editor production
source must remain browser-compatible, and imports between workspace packages
must use their public exports. Shared test factories live outside runtime
production exports.

## Release changes

Only maintainers publish `create-dumb-diagrams`. Releases are tag-driven and
must pass the release checks. The publish workflow uses npm trusted publishing
with a protected `npm-production` environment; contributors should not add npm
tokens or attempt to publish from a local checkout.
