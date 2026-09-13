<div align="center">

<img src="packages/editor/public/logo_dumbdiagrams.png" alt="Dumb Diagrams" width="120" />

# Dumb Diagrams

**Portable plain-text architecture diagrams for coding agents and people.**

Describe your system in text, then refine the diagram in a local editor. The
same portable `.dgm` source drives deterministic layout and rendering.

<br />

[![npm version](https://img.shields.io/npm/v/create-dumb-diagrams?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/create-dumb-diagrams)
[![Node.js](https://img.shields.io/node/v/create-dumb-diagrams?color=339933&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)
[![pnpm](https://img.shields.io/badge/maintained%20with-pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

</div>

---

Dumb Diagrams turns an architecture description into a diagram that is
consistent, editable, and easy to review. An agent writes a small `.dgm`
document describing resources, boundaries, and connections; the engine handles
validation, layout, routing, and rendering. Studio lets a person refine the
result, with visual decisions saved back into the same file.

The project is designed for the agent-to-architect loop: get a useful first
pass quickly, review it with people, and keep the source beside the code. It is
an opinionated architecture diagram tool rather than a general whiteboard or
hosted collaboration workspace.

You get:

- readable, Git-friendly `.dgm` source;
- deterministic layout, connector routes, and SVG for the same source and view;
- provider resources, nested boundaries, numbered flows, labels, ports, and
  manual overrides;
- local Studio for source and visual editing, recent files, and export;
- exports including PNG, JPEG, WebP, GIF, SVG, PDF, standalone HTML, XML, URL
  payloads, JSON, and canonical `.dgm` source.

AWS is the first-class provider path. Azure and cloud-agnostic authoring are
experimental. **⚠️ GCP is experimental, with limited support; expect gaps in
coverage and testing.** Experimental providers currently use their own catalog
icons with the AWS composition, layout, and routing conventions. If no
provider is named, agent workflows use cloud-agnostic; conflicting provider
signals should be clarified before authoring.

## Quick start

Requires Node.js 24 or newer. Install the CLI, then run it from the directory
where you want a new project folder:

```bash
npm install -g create-dumb-diagrams
cd path/to/your-projects
dumbdiagrams init
cd <project-folder>
dumbdiagrams studio
```

`init` asks for a project name, creates the folder, and adds agent guidance in
`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `.dumbdiagrams/`, plus a documented
`diagrams/` workspace. A blank name uses a timestamped folder. Studio is a
generic local editor: choose **Open** to select any `.dgm` file on disk.

`dgm` is an optional shorthand for the same CLI; use `dumbdiagrams` in
documentation and scripts.

## Agent workflow

After `init`, give your coding agent a request such as:

```text
Create a payments API on AWS with an API Gateway endpoint, a Lambda handler,
and a DynamoDB ledger in an AWS Region. Show the request path from a customer
through those services, and keep the source coherent when you are done.
```

The agent writes architecture, not SVG coordinates. A source file looks like
this:

```dgm
diagram payments {
  grammar aws
  flow lr
  title "Payments platform"

  generic.user customer "Customer"
  aws.region region "AWS Region" {
    aws.api-gateway api "Payments API"
    aws.aws-lambda handler "Payment handler"
    aws.dynamodb ledger "Payment ledger"
  }

  customer -> api { id request step 1 }
  api -> handler { id invoke step 2 }
  handler -> ledger { id persist step 3 }
}
```

The engine checks service types and relationships, lays out the resources, and
draws deterministic right-angle connectors. If you move an item or adjust a
route in Studio, that decision is stored as a view override in the same file.

## Repository development

This is a pnpm workspace. Use Node.js 24+ and the pinned pnpm 11.23.0:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Use `pnpm build && pnpm dev:cli` for the compiled CLI and local Studio server.
Run `pnpm smoke:package` to exercise the packed CLI artifact. The full release
workflow and the detailed command, testing, packaging, and architecture notes
are in [TECHNICAL_OVERVIEW.md](./docs/TECHNICAL_OVERVIEW.md) and
[RELEASE.md](./docs/RELEASE.md).

For website work, see the [website guide](./packages/website/README.md). Other
maintainer references are [MAINTAINING.md](./docs/MAINTAINING.md),
[VERSIONING.md](./docs/VERSIONING.md),
[ROUTING.md](./packages/runtime/ROUTING.md), the
[catalog guide](./assets/catalog/README.md), and the
[CHANGELOG](./CHANGELOG.md). Brand and UI conventions are in the
[style guide](./docs/STYLE_GUIDE.md).

## License

Copyright © 2026 DumbDiagrams contributors.

Original Dumb Diagrams source, package code, and repository-authored examples
are licensed under the [GNU Affero General Public License v3.0 only](./LICENSE).
Modified versions offered over a network must make their corresponding source
available to their users. Provider catalog icons retain their upstream terms;
see [ICON-NOTICES.md](./ICON-NOTICES.md).
