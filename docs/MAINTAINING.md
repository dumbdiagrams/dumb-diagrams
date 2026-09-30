# Maintainer map

This file maps behavior to its implementation and release gate. Preserve the
behavioral boundaries when extracting code from the larger orchestration files;
an extraction should not also change routing or workspace semantics.

For the broader system walkthrough, start with
[TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md).

| Area | Primary implementation | Fast test | Consumer-boundary test |
| --- | --- | --- | --- |
| `.dgm` grammar and document model | `packages/runtime/src/dsl`, `packages/runtime/src/core` | `pnpm test` | packed CLI smoke |
| Layout and Manhattan routing | `packages/runtime/src/layout`, `packages/runtime/src/route`, `packages/runtime/src/render/invariants.ts` | router/compiler unit tests and `pnpm check:routing` | Playwright canvas and all-format export tests |
| Editor document operations | `packages/editor/src/editor-model.ts` | editor-model unit tests | Playwright canvas interactions |
| Tabs, history, and persistence | `packages/editor/src/state/workspace.ts` | workspace unit tests | Playwright workspace tests |
| Studio serving and local files | `packages/cli/src/studio-server.ts` and `packages/editor/src/state/use-file-actions.ts` (saving), with open-picker wiring in `main.tsx` | Static-server integration tests and editor typecheck | `pnpm test:e2e`, `pnpm test:e2e:packed` |
| CLI packaging | `packages/cli/src/index.ts`, `scripts/prepare-cli-package.mjs` | CLI unit tests | Linux and Windows `pnpm smoke:package` |
| Release and Pages | `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` | workflow syntax review | exact-tag deployment repeats the Linux release gates |

## Large-module policy

`packages/editor/src/main.tsx` is the UI orchestrator; new domain logic belongs
in `editor-model.ts`, `state/`, `interactions/`, or a focused panel. Keep only
React wiring and cross-panel coordination in `main.tsx`.

`packages/runtime/src/route/router.ts` owns one deterministic scoring pipeline.
New scoring terms must have focused router tests and must preserve stable
tie-breaking. Extract pure geometry or scoring helpers only in behavior-neutral
changes, and run `pnpm check:routing` plus the browser suite after each
extraction. Do not combine a file split with route-quality tuning.

Routing also has a compile-wide deterministic work budget. It accounts for
candidate scoring, route-conflict repair, and A* expansions. When the budget is
exhausted, the router keeps the best routes found so far and the editor reports
the stable `routing-budget` warning; it must not reject the document or silently
drop every edge. The synthetic fan-out case in the router/compiler tests is the
regression guard for this fallback contract.

## Before merging

Run `pnpm check:release`; [CONTRIBUTING.md](../CONTRIBUTING.md) lists the
canonical loops. The gate includes style, catalog, dependency, build,
unit/integration coverage, typecheck, curated examples, routing, Chromium E2E,
packed-package checks, and the website. WebKit compatibility uses
`pnpm test:e2e:compat`; browser and worker orchestration are covered there
rather than in the unit coverage report.

A routing-baseline change requires visual inspection before editing
`examples/routing-warnings.json`; every baselined warning needs a matching
`reviews[]` note. Never delete a warning merely to make a pipeline green.
Performance wall-clock comparisons are advisory because hosted runner hardware
is not pinned; successful compilation, complete route retention, checked-in
fixture coverage, and deterministic fallback diagnostics are the release
contracts.

## Workflow and release maintenance

Third-party GitHub Actions in `.github/workflows/` are pinned to full commit
SHAs with a version comment. When upgrading one, resolve the release tag to its
immutable commit, update the adjacent comment, and review the action's
permissions and changelog. Do not replace a SHA with a floating major tag.

The CLI publish workflow uses npm trusted publishing rather than an npm token.
Keep the `npm-production` environment protected and configure npm's trusted
publisher to the exact workflow filename. Keep `id-token: write` scoped to the
publish job and retain exact-tag/version matching, frozen-lockfile checks, the
full `pnpm check:release` gate, exact-artifact smoke testing, and post-publish
registry integrity verification. Local release preparation should call the same
`pnpm publish:metadata` script before `prepare:standalone` and pack; set
`GITHUB_REPOSITORY=OWNER/REPO` when no GitHub remote is configured.
