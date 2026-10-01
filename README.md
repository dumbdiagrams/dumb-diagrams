<div align="center">

<img src="packages/editor/public/logo_dumbdiagrams.png" alt="Dumb Diagrams" width="120" />

# Dumb Diagrams

**Portable plain-text architecture diagrams for coding agents and people.**

[![npm version](https://img.shields.io/npm/v/create-dumb-diagrams?color=CB3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/create-dumb-diagrams)
[![Node.js](https://img.shields.io/node/v/create-dumb-diagrams?color=339933&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](./LICENSE)

</div>

---

An agent (or a person) writes a small `.dgm` file describing resources,
boundaries, and connections. The engine validates it, lays it out, routes
right-angle connectors, and renders deterministic SVG. Studio, a local browser
editor, refines the result and saves visual decisions back into the same file.

- Readable, Git-friendly source with a versioned format (`dgm 1`).
- The same source and view always produce the same geometry and SVG.
- AWS, Azure, GCP, and cloud-agnostic catalogs, each with its own validation rules.
- Exports: SVG, PNG, JPEG, WebP, GIF, PDF, standalone HTML, XML, JSON, URL, and `.dgm`.

AWS is the first-class provider. Azure, GCP, and cloud-agnostic are
experimental and share AWS layout conventions. Studio targets Chromium-based
desktop browsers.

## Quick start

Requires Node.js 24 or newer.

```bash
npm install -g create-dumb-diagrams
dumbdiagrams init          # creates a project folder with agent guidance
cd <project-folder>
dumbdiagrams studio        # opens the local editor
```

`dgm` is a shorthand alias for `dumbdiagrams`.

## A diagram

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

Check and render it from a terminal or CI:

```bash
dumbdiagrams validate --strict diagrams/*/*.dgm    # exit 1 on errors or warnings
dumbdiagrams format --check diagram.dgm            # canonical formatting
dumbdiagrams render diagram.dgm -o diagram.svg
```

The full syntax reference is on the website under **Source format**.

## Developing

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev          # Studio with hot reload
```

[CONTRIBUTING.md](./CONTRIBUTING.md) is the developer handbook: tests,
baselines, and testing the packed CLI artifact.
[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) explains the pipeline and
package boundaries, and [docs/RELEASE.md](./docs/RELEASE.md) covers
versioning, the format policy, and publishing.

## License

Copyright © 2026 DumbDiagrams contributors. Licensed under the
[GNU Affero General Public License v3.0 only](./LICENSE). Provider catalog
icons keep their upstream terms; see [ICON-NOTICES.md](./ICON-NOTICES.md).
