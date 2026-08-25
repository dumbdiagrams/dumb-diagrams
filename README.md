<div align="center">

<img src="packages/editor/public/logo_dumbdiagrams.png" alt="Dumb Diagrams" width="120" />

# Dumb Diagrams

**Architecture diagrams for LLMs to start, and humans to finish.**

An opinionated, source-first diagram engine with deterministic layout, a local
Studio, and enough guardrails to keep an AI-generated sketch understandable.

<br />

[![npm version](https://img.shields.io/npm/v/dumbdiagrams?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/dumbdiagrams)
[![Node.js](https://img.shields.io/node/v/dumbdiagrams?color=339933&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

</div>

---

## The idea

LLMs are surprisingly good at understanding an architecture conversation.
They know the services, the boundaries, and the flow. The awkward part begins
when we ask them to turn that understanding into a diagram that is consistent,
editable, and actually pleasant to read.

Dumb Diagrams gives the model a small `.dgm` language and a strongly
opinionated rendering engine. The model describes *what the architecture is*;
the engine decides where things should go, how groups should nest, where
connectors should travel, and whether the result is structurally valid. Then a
human can open Studio, move things around, adjust a route, and keep those edits
in the same source file.

The visual opinion starts with AWS architecture guidance and official examples,
filtered through what I—the creator 🙂—believe makes a diagram pretty, clear,
and quick to digest. This is not a neutral canvas. That is rather the point.

## Why another diagram tool?

[draw.io](https://www.drawio.com/),
[Lucidchart](https://www.lucidchart.com/), and
[Mermaid](https://mermaid.js.org/) are great tools. This project is not here to
pretend otherwise. They simply optimize for somewhat different jobs.

| Tool or approach | Excellent when… | Where Dumb Diagrams takes a different bet |
| --- | --- | --- |
| draw.io / diagrams.net | You want a flexible visual canvas and full manual control | A general canvas gives an LLM many tiny visual decisions to get wrong; Dumb Diagrams starts from architecture meaning and applies one layout opinion |
| Lucidchart | A team needs a mature collaborative diagramming workspace | Dumb Diagrams keeps plain files beside the code and focuses on the agent-to-architect loop rather than becoming another hosted workspace |
| Mermaid | You want lightweight diagrams-as-code in documentation | Dumb Diagrams spends more of its complexity on nested cloud boundaries, provider icons, resource cards, ports, and editable connector routes |
| MCP in front of an existing canvas | You need an agent to operate a tool your team already uses | MCP can be genuinely useful, but a model driving a general-purpose canvas can still produce mixed results between runs; here the model writes a constrained document and a deterministic engine does the drawing |

The goal is not to replace every diagram. It is to make one particular moment
much better: an architect has an idea, asks an LLM for the first pass, and gets
an opinionated diagram that is already useful enough to discuss and refine.

## What you get

- **A tiny, agent-friendly source format.** `.dgm` is readable, reviewable, and
  easy for an LLM to edit without moving hundreds of canvas objects.
- **Deterministic results.** The same source and saved view produce the same
  layout, connector routes, and SVG.
- **Architecture-aware structure.** Resources, groups, containment, numbered
  flows, labels, ports, and manual overrides are first-class concepts.
- **Opinionated automatic layout.** New diagrams begin with a coherent visual
  hierarchy instead of an empty infinite canvas.
- **A human editing surface.** Studio supports moving and resizing items,
  editing source, adjusting routes, managing multiple diagrams, and exporting.
- **Local files, not a hidden database.** Diagrams live beside the project, work
  with Git, and can be edited by Cursor, Codex, Claude, or another coding agent.
- **Guardrails.** The CLI validates source and reports layout/routing problems
  before a broken diagram quietly becomes the new reference.
- **Useful outputs.** Export PNG, JPEG, WebP, GIF, SVG, PDF, standalone HTML,
  XML, URL payloads, JSON, or canonical `.dgm` source.

## Honest tradeoffs

Dumb Diagrams is a good fit when you want an LLM-assisted architecture diagram
with a strong default style. It is intentionally less suitable when you want:

- a general illustration, free-form whiteboard, or pixel-perfect design tool;
- real-time multi-user collaboration hosted by a SaaS vendor;
- live discovery of cloud resources or a replacement for infrastructure
  inventory;
- a completely unopinionated renderer that accepts any visual arrangement;
- a mobile editor—v0.1 is desktop-focused, with roughly 1280px as the comfortable
  baseline.

AWS is the strongest grammar, example, and visual-guidance path today. The
catalog also contains cloud-agnostic and other provider assets, but the product
should currently be evaluated as AWS-first rather than magically universal.
Very dense diagrams can still force connector compromises; Studio exposes
manual routes for the cases where the architect knows better than the router.

## Quick start

Requires Node.js 24 or newer.

```bash
npx dumbdiagrams@latest init --open-editor
```

The command asks for a project name, creates a folder with a starter diagram and
agent instructions, and can open it in your editor. Run the printed `Next:`
command to open the project’s diagrams in Studio.

Prefer a fully explicit command?

```bash
npx dumbdiagrams@latest init \
  --name "Payments Platform" \
  --diagram system-overview \
  --description "Event-driven billing architecture." \
  --open-editor

cd payments-platform
npx dumbdiagrams@latest studio diagrams
```

Every diagram is a normal file under `diagrams/`. Studio watches the selected
file, saves changes back to disk, notices external edits, and protects against
overwriting a newer revision.

## The agent workflow

`init` creates more than an empty drawing. It adds:

- `DUMB_DIAGRAMS.md`, the local architecture-diagram contract;
- `AGENTS.md` and `CLAUDE.md`, entry points for common coding agents;
- `CATALOG.md` and `CATALOG.json`, the available icon and type inventory;
- a `diagrams/` directory with its own guidance;
- curated source/prompt examples that show the expected style.

That means the useful prompt can stay pleasantly short:

```text
Read DUMB_DIAGRAMS.md and the closest example. Create a new diagram for our
payments flow under diagrams/. Keep the public and private boundaries obvious,
number the main request path, and validate the result when you are done.
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
    group app "Application" {
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

The engine validates the service types and relationships, places the resources,
and draws deterministic right-angle connectors. If you move something or pin a
route in Studio, that human decision is written into the `view` block and wins
on the next render.

## Everyday commands

```bash
# Start or open a project
npx dumbdiagrams@latest init
npx dumbdiagrams@latest studio diagrams
npx dumbdiagrams@latest studio diagrams/system-overview.dgm

# Check and normalize source
npx dumbdiagrams@latest validate diagrams
npx dumbdiagrams@latest format diagrams/system-overview.dgm --write

# Produce a portable SVG without opening Studio
npx dumbdiagrams@latest render diagrams/system-overview.dgm --output architecture.svg
```

An optional global install exposes both command names:

```bash
npm install -g dumbdiagrams
dumbdiagrams studio diagrams
dgm validate diagrams
```

## Working on this repository

This repository uses the pinned pnpm workspace setup. The supported development
entry point is `pnpm dev`, not `npm run dev`.

| What you changed | Use this loop |
| --- | --- |
| Studio UI | `pnpm dev` |
| Runtime, CLI, templates, or CLI-served Studio | `pnpm build && pnpm dev:cli [file-or-folder]` |
| Packaging or bundled assets | `pnpm build && pnpm smoke:package` |
| Release candidate | `pnpm check:release` |

The tarball path is for testing the real published-package boundary without
publishing anything. `pnpm smoke:package` packs the CLI and exercises it through
local `npx`; `pnpm test:e2e:packed` additionally drives the bundled Studio
against real files.

For the full programmer-oriented tour—technologies, repository structure,
package boundaries, compilation stages, routing, local Studio APIs, catalog,
packaging, and tests—read
**[docs/TECHNICAL_OVERVIEW.md](./docs/TECHNICAL_OVERVIEW.md)**.

Other maintainer references:

- [Maintainer map](./docs/MAINTAINING.md)
- [Release and rollback](./docs/RELEASE.md)
- [Versioning policy](./docs/VERSIONING.md)
- [Exact connector-routing rules](./packages/runtime/ROUTING.md)
- [Catalog provenance and updates](./assets/catalog/README.md)
- [Changelog](./CHANGELOG.md)

## Project status

v0.1 is deliberately focused: local, desktop-first, AWS-first, and built around
the architect-plus-coding-agent workflow. The repository’s release gate covers
the engine, CLI, Studio, all export formats, the packed npm consumer journey,
and a clean rebuild of the AGPL corresponding source. Linux is the full browser
release platform; Windows additionally runs the publishable CLI smoke in CI.

## License

Copyright © 2026 DumbDiagrams contributors.

Original Dumb Diagrams source, package code, and repository-authored examples
are licensed under the [GNU Affero General Public License v3.0 only](./LICENSE).
Modified versions offered over a network must make their corresponding source
available to their users. Provider catalog icons retain their upstream terms;
see [ICON-NOTICES.md](./ICON-NOTICES.md).
