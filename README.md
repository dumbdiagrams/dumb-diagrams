<div align="center">

<img src="packages/editor/public/logo_dumbdiagrams.png" alt="Dumb Diagrams" width="120" />

# Dumb Diagrams

**A little opinionated. A lot clearer.**

Architecture diagrams as code for AI-first teams. Describe the system in a
readable `.dgm` file, let the engine handle layout and routing, then review and
refine it in Studio on your machine.

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

## Support development

If Dumb Diagrams makes your day easier, leave a tip on Ko-fi. Your tips help
maintain the project and support building more useful tools for people.

<div align="center">
  <a href="https://ko-fi.com/P5P31WH7UZ" target="_blank" rel="noopener noreferrer"><img height="36" style="border:0px;height:36px;" src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" border="0" alt="Support development with a tip on Ko-fi" /></a>
</div>

## License

Licensed under the [GNU Affero General Public License v3.0 only](LICENSE).
Provider catalog icons retain their upstream terms; see
[ICON-NOTICES.md](ICON-NOTICES.md).
