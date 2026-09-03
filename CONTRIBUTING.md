# Contributing

Contributions are welcome under the repository's AGPL-3.0-only license. Keep
the application local-first: do not add telemetry, remote asset fetches, or
network dependencies without an explicit design review and user-facing
consent.

## Development

Use Node.js 24 or newer and the pinned pnpm version from `package.json`:

```bash
pnpm install --frozen-lockfile
pnpm test:unit
pnpm check:style
pnpm typecheck
```

Run the narrowest relevant package or integration test while iterating. Before
opening a release-oriented change, run `pnpm check:release` when the required
browser dependencies are available. Never commit generated catalog or build
outputs by hand; use the documented generator and inventory checks.

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

## Release changes

Only maintainers publish `create-dumb-diagrams`. Releases are tag-driven and
must pass the release checks. The publish workflow uses npm trusted publishing
with a protected `npm-production` environment; contributors should not add npm
tokens or attempt to publish from a local checkout.
