---
title: Work with an agent
description: Give a coding agent context to draft a .dgm file, then refine it in Studio.
section: Start here
order: 2
---
A coding agent can write `.dgm` source from an architecture description. The
engine checks the diagram against a machine-readable requirements companion,
handles placement and routing, and you review the result in Studio.

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

First extract requirements into diagrams/payments/diagram.requirements.json,
then create diagrams/payments/diagram.dgm and its architecture-brief.md.
A customer calls an API Gateway endpoint. A Lambda handler processes the
request and writes to a DynamoDB ledger. Keep the services inside an AWS
Region and number the main request path. Use the catalog's exact types. Give
each required component and relationship a stable ID, and record any required
counts and containment in the requirements file before writing the diagram.
Keep the requirements file open while laying out the diagram; preserve those
IDs when rearranging it.

Run `dumbdiagrams validate diagrams/payments/diagram.dgm` and then
`dumbdiagrams validate --strict diagrams/payments/diagram.dgm`. If either run
finds a fixable issue, make at most two focused repair passes, preserving the
requirement IDs, and run both commands again. Then inspect the result in Studio.
```

Describe meaning, not placement: the provider, services and boundaries, the
main path in order, supporting relationships, counts, containment, and labels
that must appear exactly. The agent turns that request into a requirements
contract (`.requirements.json`) and an `architecture-brief.md` beside the
source with `Goal`, `Explicit requirements`, `Relationships and containment`,
and `Inferred decisions and exclusions`. Review both before the source; a
complete check only proves that the source matches the written contract, not
that the contract captures your request.

A file has one primary provider `grammar`. Without a named provider, the
agent uses `cloud-agnostic`. Provider rules are checked per grammar, so a
warning such as `managed-service-in-network` on an AWS diagram is about AWS.

## Update a diagram

```text
Update diagrams/payments/diagram.requirements.json to require a queue before
the worker, then update diagram.dgm and the architecture brief to match.
Preserve existing component and relationship IDs, labels, and the saved view.
```

Stable IDs keep saved positions and routes attached. If you ask for a new
orientation, the agent may need to drop saved placements that would fight the
new layout. Studio does not live-reload files edited elsewhere, so reopen the
file after the agent saves it.

Validation checks completeness against the companion contract and reports
provider and routing findings. It cannot prove that the contract reflects the
real system. Check your requirements, boundaries, and connection directions
yourself. For automation, pin the CLI version you have tested.
