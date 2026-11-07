<div align="center">

<img src="packages/editor/public/logo_dumbdiagrams.png" alt="Dumb Diagrams" width="120" />

# Dumb Diagrams

<p>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D24-5FA04E?logo=nodedotjs&logoColor=white" alt="Node.js 24 or newer" /></a>
  <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-11.23.0-F69220?logo=pnpm&logoColor=white" alt="pnpm 11.23.0" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue" alt="License: AGPL-3.0-only" /></a>
</p>

**A little opinionated. A lot clearer.**

Architecture diagrams as code for LLM-augmented workflows. Describe the system
in a readable `.dgm` file yourself or with a coding agent, let the engine handle
layout and routing, then review and refine it in Studio on your machine.

<a href="https://dumbdiagrams.com">Official website</a> · <a href="https://dumbdiagrams.com/docs/">Documentation</a>

<a href="https://ko-fi.com/P5P31WH7UZ" target="_blank" rel="noopener noreferrer"><img height="36" src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" alt="Support development with a tip on Ko-fi" /></a>

Tips help maintain Dumb Diagrams and support building more useful tools for people.

</div>

## How it works

Keep the architecture in plain text that you can review in a diff and version
with your project. The engine checks the source, places resources, routes
right-angle connections, and renders repeatable SVG. Studio lets you move
resources, adjust routes, and save those visual decisions back into the same
`.dgm` file.

- AWS is the first-class provider. Azure, Google Cloud, and cloud-agnostic
  diagrams are available, but remain experimental.
- Studio runs locally and opens `.dgm` files from your machine. It targets
  Chromium-based desktop browsers.
- No model or AI service is built in. Use the coding agent of your choice, or
  write and edit the source yourself.
- Diagrams are architecture views, not live infrastructure inventories.

## Get started

Requires Node.js 24 or newer.

```bash
npm install -g create-dumb-diagrams
dumbdiagrams init
cd <project-folder>
dumbdiagrams studio
```

`init` creates a project folder with agent guidance and a diagrams workspace.
`studio` starts the local editor; use **Open** to choose a `.dgm` file. Keep
the command running while you work. The `dgm` command is a short alias for
`dumbdiagrams`.

## A small example

An agent or person can describe services and connections without assigning
canvas coordinates:

```dgm
dgm 1
diagram payments {
  grammar aws
  flow lr
  title "Payments platform"

  cloud-agnostic.actor customer "Customer"

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

Every diagram needs a companion requirements contract. For a file named
`diagram.dgm`, put `requirements.json` beside it; for other names, use the
same stem, such as `payments.requirements.json`. The contract records what the
diagram must contain. Validation checks the source against that contract, so
review the contract itself against the architecture you intended. Initialized
projects include a schema and authoring guidance.

```bash
dumbdiagrams validate diagrams/payments/diagram.dgm
dumbdiagrams validate --strict diagrams/payments/diagram.dgm
dumbdiagrams format --check diagrams/payments/diagram.dgm
dumbdiagrams render diagrams/payments/diagram.dgm -o payments.svg
```

Normal validation checks source, requirements, and provider findings.
`--strict` also fails on routing findings. See the
[quick start](packages/website/src/content/docs/quick-start.md),
[agent workflow](packages/website/src/content/docs/agent-workflow.md), and
[`.dgm` format reference](packages/website/src/content/docs/source-format.md)
for the full workflow and syntax.

## Development and contributions

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` runs Studio with hot reload. See [CONTRIBUTING.md](CONTRIBUTING.md)
for setup and project guidance, [Testing](docs/TESTING.md) for validation
workflows, and [Architecture](docs/ARCHITECTURE.md) for the engine and package
boundaries.

Clear issue reports and reproducible examples are welcome. Implementation is
maintainer-led; please discuss a proposed change first. Unsolicited pull
requests may not be accepted. For security concerns, see
[SECURITY.md](SECURITY.md).

## License

Licensed under the [GNU Affero General Public License v3.0 only](LICENSE).
Provider catalog icons retain their upstream terms; see
[ICON-NOTICES.md](ICON-NOTICES.md).
