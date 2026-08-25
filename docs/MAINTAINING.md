# Maintainer map

This file maps behavior to its implementation and release gate. Preserve the
behavioral boundaries when extracting code from the larger orchestration files;
an extraction should not also change routing or workspace semantics.

For the broader system walkthrough, start with
[TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md).

| Area | Primary implementation | Fast test | Consumer-boundary test |
| --- | --- | --- | --- |
| `.dgm` grammar and validation | `packages/runtime/src/dsl`, `packages/runtime/src/core` | `pnpm test` | tarball `validate` and `format` smoke |
| Layout and Manhattan routing | `packages/runtime/src/layout`, `packages/runtime/src/route`, `packages/runtime/src/render/invariants.ts` | router/compiler unit tests and `pnpm check:routing` | Playwright canvas and all-format export tests |
| Editor document operations | `packages/editor/src/editor-model.ts` | editor-model unit tests | Playwright canvas interactions |
| Tabs, history, and persistence | `packages/editor/src/state/workspace.ts` | workspace unit tests | Playwright workspace tests |
| Local file bridge | `packages/cli/src/studio-server.ts` and the local-Studio effect in `packages/editor/src/main.tsx` | Studio HTTP integration tests | `pnpm test:e2e:packed` |
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

## Before merging

Run `pnpm check:release`. A routing-baseline change is exceptional: inspect the
affected rendered examples before editing `examples/routing-warnings.json`.
Never weaken coverage thresholds or delete a baseline warning merely to make a
pipeline green.
