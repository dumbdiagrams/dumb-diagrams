---
title: Work with an agent
description: Give a coding agent context to draft a .dgm file, then refine it in Studio.
section: Start here
order: 2
---
A coding agent can turn an architecture discussion into a structured file instead of placing hundreds of shapes on a canvas. It works with readable source and explicit constraints, while the diagram engine handles placement and routing. You can then review the source and make visual changes in Studio.

## Set up an agent

Run `dumbdiagrams init` from the directory where you want the new project folder. It creates agent entrypoints and shared instructions under `.dumbdiagrams/`, including catalog and example guidance. Leave the project name blank to create a timestamped folder.

The workflow requires a separate coding agent, such as **Codex, Claude Code, Cursor, Gemini**, or an **open-source alternative**. Open the generated project folder in that agent’s working environment and configure its account, model access, or local model there. Dumb Diagrams provides the diagram language, reference files, and Studio; it does not install an agent, provide model access, or send your files anywhere automatically.

Review the agent’s access and data settings before giving it a private project. You can also [write the source yourself](../source-format/) or [edit in Studio](../studio/).

## Give the agent the architecture

Have the agent read `AGENTS.md`, then `.dumbdiagrams/instructions.md` and the closest example under `.dumbdiagrams/examples/`. Use the catalog as the reference for service types: a familiar service name is not always the identifier the engine expects.

For example:

```text
Read AGENTS.md and the closest `.dumbdiagrams` instructions and example.

Create diagrams/payments/diagram.dgm for our payments flow, and persist the
interpreted architecture in diagrams/payments/architecture-brief.md.
A customer calls an API Gateway endpoint. A Lambda handler
processes the request and writes to a DynamoDB ledger.
Keep the services inside an AWS Region and number the main
request path. Use the catalog’s exact service types.

Let the engine handle initial layout. Review the resulting source when you are done.
```

The architecture brief is a concise, reviewable interpretation of the request. It uses the same `Goal`, `Explicit requirements`, `Relationships and containment`, and `Inferred decisions and exclusions` sections as the bundled examples. It is not hidden model reasoning and does not replace the `.dgm` source of truth. Update it when architecture semantics change; pure visual refinements do not require a rewrite.

When a request names a provider, use its matching diagram grammar. AWS is the first-class provider. Azure, GCP, and cloud-agnostic diagrams are experimental; for now they reuse AWS composition, layout, and routing conventions while using their own provider icons. When no provider is named, use the cloud-agnostic grammar without asking. If provider wording conflicts, or a multi-cloud request has no clear primary provider, clarify the scope before writing the brief or diagram. A source file has one primary provider grammar, so do not silently mix provider catalogs.

Describe meaning before placement: the title and provider context, the services and boundaries, the main request or event path in order, quieter supporting relationships, and labels that must appear exactly as written. Coordinates are usually unnecessary. Let the engine create an initial layout, then make visual decisions in Studio.

## Update and review a diagram

Name the file explicitly and ask the agent to preserve its saved view and keep unrelated services and connections intact:

```text
Update diagrams/payments/diagram.dgm to add a queue before the worker, and
update diagrams/payments/architecture-brief.md with the semantic change.
Preserve the current labels and saved view wherever possible.
Do not change the other diagrams or the reference examples.
Keep the `.dgm` source valid after the edit.
```

### Ask an agent to refine the picture

You can give the same separate coding agent or LLM an existing `.dgm` file and ask it to refine the presentation while preserving the architecture. It can change horizontal or vertical orientation, grouping, labels, connector styles, or move supporting services away from the main path. You can also ask for architecture changes, such as adding a service. You can make these changes manually in Studio too.

For example, this request asks for a vertical arrangement and gives the agent permission to resolve layout conflicts while keeping the system intact:

```text
Refine diagrams/payments/diagram.dgm into a top-to-bottom flow.
Preserve every existing service and relationship. You may adjust conflicting
saved placements and manual connector routes so the vertical layout is clear.
Keep the service labels, group membership, and connector meanings intact.
Keep the `.dgm` source valid and validate it after the edit.
```

An explicit orientation request may require revising saved manual placements or routes. If those placements stay in the file, they can prevent the engine from reorganizing the diagram. Review the result in Studio after the agent saves it; Studio does not live-reload edits made by another editor.

Validation finds structural mistakes, but it cannot tell whether the diagram matches the real system. Open the file in Studio and check the boundaries, service choices, and connection directions yourself. Refine dense connections with a manual route if needed, then commit the diagram with the implementation or proposal it explains.

For automation, pin the CLI version you have tested instead of resolving `@latest` on every run.
