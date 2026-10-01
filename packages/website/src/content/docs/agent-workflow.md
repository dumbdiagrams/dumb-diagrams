---
title: Work with an agent
description: Give a coding agent context to draft a .dgm file, then refine it in Studio.
section: Start here
order: 2
---
A coding agent can write `.dgm` source from an architecture description. The
engine handles placement and routing, and you review the result in Studio.

## Set up

`dumbdiagrams init` creates agent entrypoints (`AGENTS.md`, `CLAUDE.md`,
`GEMINI.md`) and shared guidance under `.dumbdiagrams/`: the workflow, the
format, provider notes, the catalog, and examples. Open the project in any
coding agent: Codex, Claude Code, Cursor, Gemini, or an open-source tool.
Dumb Diagrams does not provide model access and sends nothing anywhere; review
your agent's own data settings before giving it a private project.

## Ask for a diagram

```text
Read AGENTS.md and the closest .dumbdiagrams instructions and example.

Create diagrams/payments/diagram.dgm and its architecture-brief.md.
A customer calls an API Gateway endpoint. A Lambda handler processes the
request and writes to a DynamoDB ledger. Keep the services inside an AWS
Region and number the main request path. Use the catalog's exact types.
Validate with dumbdiagrams validate --strict.
```

Describe meaning, not placement: the provider, the services and boundaries,
the main path in order, supporting relationships, and labels that must appear
exactly. The agent writes an `architecture-brief.md` beside the source with
`Goal`, `Explicit requirements`, `Relationships and containment`, and
`Inferred decisions and exclusions`. Review it first; it is the cheapest place
to catch a misunderstanding.

A file has one primary provider `grammar`. Without a named provider, the
agent uses `cloud-agnostic`. Provider rules are checked per grammar, so a
warning such as `managed-service-in-network` on an AWS diagram is about AWS.

## Update a diagram

```text
Update diagrams/payments/diagram.dgm to add a queue before the worker, and
update its architecture brief. Preserve labels, IDs, and the saved view.
```

Stable IDs keep saved positions and routes attached. If you ask for a new
orientation, the agent may need to drop saved placements that would fight the
new layout. Studio does not live-reload files edited elsewhere, so reopen the
file after the agent saves it.

Validation catches structural mistakes, not whether the diagram matches the
real system. Check the boundaries and connection directions yourself. For
automation, pin the CLI version you have tested.
