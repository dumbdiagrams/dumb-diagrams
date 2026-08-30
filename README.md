<div align="center">

<img src="packages/editor/public/logo_dumbdiagrams.png" alt="Dumb Diagrams" width="120" />

# Dumb Diagrams

**Portable plain-text architecture diagrams for coding agents and people.**

A source-first diagram engine with deterministic layout and a generic local
Studio for portable `.dgm` files.

<br />

[![npm version](https://img.shields.io/npm/v/create-dumb-diagrams?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/create-dumb-diagrams)
[![Node.js](https://img.shields.io/node/v/create-dumb-diagrams?color=339933&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

</div>

---

For fonts, colors, the official wordmark, and UI component conventions, see the
[style guide](./docs/STYLE_GUIDE.md).

## The idea

Coding agents can follow an architecture conversation. They can identify the
services, boundaries, and flow. The difficult part is turning that understanding
into a diagram that is consistent, editable, and easy to review.

Dumb Diagrams gives the agent a small `.dgm` language and a rendering engine
with defined layout rules. The agent describes *what the architecture is*;
the engine decides where resources go, how groups nest, where connectors travel,
and whether the result is structurally valid. A person can then open Studio,
move items, adjust a route, and keep those edits in the source file.

The visual conventions start with AWS architecture guidance and official
examples. The layout favors readable grouping, explicit boundaries, and short
paths over a neutral canvas.

## Why another diagram tool?

[draw.io](https://www.drawio.com/),
[Lucidchart](https://www.lucidchart.com/), and
[Mermaid](https://mermaid.js.org/) are great tools. This project is not here to
pretend otherwise. Each one serves a different job.

| Tool or approach | Best when | Where Dumb Diagrams takes a different approach |
| --- | --- | --- |
| draw.io / diagrams.net | You want a flexible visual canvas and full manual control | A general canvas leaves many small visual decisions to the author; Dumb Diagrams starts from architecture meaning and applies one layout opinion |
| Lucidchart | A team needs a mature collaborative diagramming workspace | Dumb Diagrams keeps plain files beside the code and focuses on the agent-to-architect loop instead of adding another hosted workspace |
| Mermaid | You want lightweight diagrams-as-code in documentation | Dumb Diagrams spends more of its complexity on nested cloud boundaries, provider icons, resource cards, ports, and editable connector routes |
| MCP in front of an existing canvas | You need an agent to operate a tool your team already uses | MCP can be useful, but a model driving a general-purpose canvas can produce different results between runs; here the model writes a constrained document and a deterministic engine does the drawing |

The goal is not to replace every diagram tool. It is to improve one particular
moment: an architect has an idea, asks an agent for a first pass, and gets a
diagram that is ready to discuss and refine.

## Included

- **A compact source format for agents.** `.dgm` is readable, reviewable, and
  straightforward to edit without moving hundreds of canvas objects.
- **Deterministic results.** The same source and saved view produce the same
  layout, connector routes, and SVG.
- **Architecture-aware structure.** Resources, groups, containment, numbered
  flows, labels, ports, and manual overrides are first-class concepts.
- **Opinionated automatic layout.** New diagrams begin with a coherent visual
  hierarchy instead of an empty infinite canvas.
- **A human editing surface.** Studio supports moving and resizing items,
  editing source, adjusting routes, recent files, and exporting.
- **Portable local files, not a hidden database.** `.dgm` files can live
  anywhere on disk, work with Git, and can be edited by Cursor, Codex, Claude,
  or another coding agent.
- **Several output formats.** Export PNG, JPEG, WebP, GIF, SVG, PDF, standalone HTML,
  XML, URL payloads, JSON, or canonical `.dgm` source.

## Honest tradeoffs

Dumb Diagrams fits when you want an agent-assisted architecture diagram
with a strong default style. It is intentionally less suitable when you want:

- a general illustration, free-form whiteboard, or pixel-perfect design tool;
- real-time multi-user collaboration hosted by a SaaS vendor;
- live discovery of cloud resources or a replacement for infrastructure
  inventory;
- a renderer with no preset visual model that accepts any arrangement;
- a mobile editor. v0.1 is desktop-focused, with roughly 1280px as the comfortable
  baseline.

AWS is the strongest grammar, example, and visual-guidance path today. The
catalog also contains cloud-agnostic and other provider assets, but the product
should currently be evaluated as AWS-first rather than provider-neutral.
Very dense diagrams can still force connector compromises; Studio exposes
manual routes for the cases where the architect knows better than the router.

## Quick start

Requires Node.js 24 or newer. Install the CLI, prepare the repository where an
agent will work, then start Studio:

```bash
npm install -g create-dumb-diagrams
cd path/to/your-repository
dumbdiagrams init
dumbdiagrams studio
```

`init` keeps the prompt for your repository/project name and writes the
`.dumbdiagrams/` agent guidance plus `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
Studio is independent of the directory where it was launched: choose **Open** to select
any `.dgm` file anywhere on disk.

`dgm` is a convenience shorthand for the same commands:

```bash
dgm init
dgm studio
```

Use `dumbdiagrams` in documentation and scripts.

## The agent workflow

`init` prepares the current repository for coding agents. It adds:

- a small `AGENTS.md` router plus tiny `CLAUDE.md` and `GEMINI.md` compatibility entrypoints;
- `.dumbdiagrams/`, the shared architecture, source, provider, catalog, and example knowledge;
- reference examples that show the expected style.

The prompt can stay short:

```text
Create a highly available payments API on AWS using ECS Fargate and Aurora
PostgreSQL. Keep the application and database private, show the main request
path, and keep the source coherent when you are done.
```

The agent writes architecture, not SVG coordinates. A source file looks roughly
like this:

```dgm
diagram payments {
  grammar aws
  flow lr
  title "Payments platform"

  generic.user customer "Customer"
  aws.region use1 "AWS Region" {
    cloud-agnostic.boundary app "Application" {
      aws.api-gateway gateway "Payments API"
      aws.aws-lambda handler "Payment handler"
    }
    aws.dynamodb ledger "Payment ledger"
  }

  customer -> gateway { id request step 1 kind flow }
  gateway -> handler { id invoke step 2 kind flow }
  handler -> ledger { id persist step 3 kind flow }
}

view default {
}
```

The engine checks service types and relationships, places resources, and draws
deterministic right-angle connectors. If you move something or pin a route in
Studio, that human decision is written into the `view` block and persists in
the same portable file.

## Everyday commands

```bash
dumbdiagrams init
dumbdiagrams studio
```

After Studio starts, use **Open** to choose a file, including a file outside
the repository where you ran the command. `dgm` is the optional shorthand:

```bash
dgm init
dgm studio
```

## Working on this repository

This repository uses the pinned pnpm workspace. Use `pnpm` for workspace
dependencies and `npm` when installing the published CLI.

### Test the CLI locally (before publishing)

Use this flow when CLI changes need to be tested through the same global
commands an end user will run. It rebuilds the workspace, creates and verifies
a local tarball, then installs that exact tarball globally.

Use Node.js 24 or newer and pnpm 11.23.0. Stop any local Studio or dev server
before removing build outputs.

```bash
set -e
cd "$(git rev-parse --show-toplevel)"
# If you use nvm, run `nvm use` here before continuing.
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build
pnpm smoke:package
ARTIFACT="$PWD/.artifacts/packages/create-dumb-diagrams-0.1.0.tgz"
npm install -g "$ARTIFACT"
dumbdiagrams --version
dgm --version
```

Confirm the version output is Node 24+ and pnpm 11.23.0 before continuing.

Both version commands should report the package version. `pnpm smoke:package`
creates the tarball, checks its contents, exercises `init`, `studio`, and the
`dgm` alias, and verifies that the included source can rebuild. These commands
do not publish to npm.

The fresh artifact is:
`.artifacts/packages/create-dumb-diagrams-0.1.0.tgz` in the repository root.

If npm reports a permission problem or command conflict during the global
install, stop. Do not add `sudo` or `--force`.

To test the **exact npm tarball**, use:

```bash
pnpm smoke:package
```

That packs the CLI and runs `init` for you automatically.

### Other development loops

| What you changed | Command |
| --- | --- |
| Studio UI only | `pnpm dev` |
| Website and public docs | `pnpm dev:website` |
| CLI or how Studio is served | `pnpm build && pnpm dev:cli` |
| Full release check | `pnpm check:release` |

For command behavior and deeper CLI testing, see
**[docs/TECHNICAL_OVERVIEW.md](./docs/TECHNICAL_OVERVIEW.md)**.

### Website and documentation

The static Astro website lives in `packages/website`, separate from Studio and
the published CLI. Run `pnpm dev:website` to work on it, `pnpm check:website` to
typecheck, build, and validate it, or `pnpm preview:website` to preview the
production build with documentation search. Static output goes to
`packages/website/dist/`.

See [the website guide](./packages/website/README.md) for content editing,
static hosting, base paths, and the optional Partytown integration. Analytics
are disabled by default.

Other maintainer references:

- [Maintainer map](./docs/MAINTAINING.md)
- [Release and rollback](./docs/RELEASE.md)
- [Versioning policy](./docs/VERSIONING.md)
- [Exact connector-routing rules](./packages/runtime/ROUTING.md)
- [Catalog provenance and updates](./assets/catalog/README.md)
- [Changelog](./CHANGELOG.md)

## Project status

v0.1 is focused: local, desktop-first, AWS-first, and built around
the architect-plus-coding-agent workflow. The repository’s release gate covers
the engine, CLI, Studio, all export formats, the packed npm consumer journey,
and a clean rebuild of the AGPL corresponding source. Linux runs Chromium and WebKit as the full browser
release platform; Windows additionally runs the publishable CLI smoke in CI.

## License

Copyright © 2026 DumbDiagrams contributors.

Original Dumb Diagrams source, package code, and repository-authored examples
are licensed under the [GNU Affero General Public License v3.0 only](./LICENSE).
Modified versions offered over a network must make their corresponding source
available to their users. Provider catalog icons retain their upstream terms;
see [ICON-NOTICES.md](./ICON-NOTICES.md).
