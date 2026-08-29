---
title: Work on the project
description: Find the package to change, choose the appropriate development loop, and run the checks for that boundary.
section: Under the hood
order: 10
---
The repository uses Node.js 24 or newer and the pnpm version pinned in its root `packageManager` field. Use pnpm for repository development; the npm commands in the quick start are for people consuming the published CLI.

## Repository layout

```text
packages/
  brand/      Shared fonts, palette, and official wordmark
  runtime/    Document model, language, layout, routing, rendering
  editor/     React Studio and browser exports
  cli/        Published command and local file server
  website/    Static Astro website and these docs
docs/         Technical and maintainer source material
examples/     Diagrams, prompts, and routing expectations
scripts/      Build, catalog, packaging, and release checks
```

The website is intentionally independent of Studio’s production build. Changing an article should not require bundling the editor, and publishing the CLI should not silently publish a website.

## Choose a workflow

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` starts Studio through Vite. Use it for browser UI work; it does not provide the CLI’s local file bridge.

For local-file behavior:

```bash
pnpm build
pnpm dev:cli examples/curated/aws-high-availability-web-app/diagram.dgm
```

For the website:

```bash
pnpm dev:website
```

The site uses Astro content collections, ordinary Markdown, and limited browser JavaScript. Its diagram examples are compiled by the real runtime before the site builds. No runtime or React bundle is sent to website visitors.

## Check what you changed

| Change | Useful checks |
| --- | --- |
| Runtime or document behavior | `pnpm test`, `pnpm check` |
| Connector planning | `pnpm check:routing`, visual review of changed examples |
| Studio interactions | `pnpm typecheck`, `pnpm test:e2e` |
| CLI or packaging | `pnpm smoke:package`, `pnpm test:e2e:packed` |
| Website or docs | `pnpm check:website` |
| A release | `pnpm check:release` and the release checklist |

Prefer the existing tests that cover a behavior. Add coverage where a change introduces a meaningful gap, rather than merely restating a configuration value.

## Test the package people receive

Workspace success does not prove the npm package contains everything it needs. The package preparation step bundles the runtime, copies Studio and templates, stages the reviewed catalog, and includes corresponding source.

`pnpm smoke:package` consumes the tarball locally and checks the CLI journey, including an invalid-input case that is expected to fail. Packed browser tests exercise the actual CLI server and bundled editor together.

The corresponding-source snapshot is also rebuilt in checks. Keep that boundary intact when changing workspace structure or packaging scripts.

## Keep documentation current

Public articles live in `packages/website/src/content/docs/`. Their foundation is `docs/TECHNICAL_OVERVIEW.md`, with exact contracts in focused files such as `packages/runtime/ROUTING.md`.

When behavior changes, update the public explanation and the technical reference together. Prefer a short example and a direct account of the tradeoff over a list of implementation symbols.

The website’s README explains static hosting, base paths, search, and the optional Partytown integration. No tracker is enabled by default.

For visual changes, read [Brand and interface](../design-system/) and the repository’s `docs/STYLE_GUIDE.md`. Studio uses custom React controls and CodeMirror, not shadcn/ui; the website uses Astro components and plain CSS.
