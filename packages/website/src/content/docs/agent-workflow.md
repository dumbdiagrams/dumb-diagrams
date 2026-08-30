---
title: LLM-first diagram workflow
description: Prepare a repository for coding agents, draft portable .dgm source, and refine it locally in Studio.
section: Start here
order: 2
---
A coding agent can turn an architecture discussion into a structured file. It does not need to place hundreds of shapes on a canvas by hand.

That is what **LLM-first** means here: the large language model works with readable source and explicit constraints, while the diagram engine handles deterministic placement and routing. The workflow is diagrams as code, with a visual editor when you need one. You stay in control of both the source and the final result.

Run `dumbdiagrams init` from the directory where you want the new project
folder. It creates small agent entrypoints and shared instructions under
`.dumbdiagrams/`, including catalog and example guidance. Leave the project
name blank to create a timestamped folder. Use those files with a coding agent
you already have. Dumb Diagrams does not include a hosted model or send your
files anywhere automatically.

## Use a coding agent

The agent workflow requires a separate coding agent, such as **Codex, Claude Code, Cursor, Gemini**, or an **open-source alternative**. Choose a tool that can read repository instructions and edit local `.dgm` files. These are examples, not built-in integrations.

Open the generated project folder in the agent's working environment. Configure
its account, model access, or local model there. Dumb Diagrams provides the
diagram language, reference files, and Studio. It does not install an agent or
provide model access.

The agent's settings determine which files it can access and whether it sends them to a model provider. Review those settings before giving it a private project.

You can also [write the source yourself](../source-format/) or [edit in Studio](../studio/).

## Start with the repository instructions

Have the agent read `AGENTS.md`, then `.dumbdiagrams/instructions.md` and the closest example under `.dumbdiagrams/examples/`. The catalog is the reference for service types. A familiar service name is not always the identifier the engine expects.

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

The architecture brief is the concise, reviewable interpretation of the
request, using the same `Goal`, `Explicit requirements`, `Relationships and
containment`, and `Inferred decisions and exclusions` sections as the bundled
examples. It is not hidden model reasoning and it does not replace the `.dgm`
source of truth. Agents update it when architecture semantics change; pure
visual refinements do not require a rewrite.

## Choose a provider

The initialized workflow maps explicit provider language to the matching diagram grammar. AWS is the first-class provider. Azure, GCP, and cloud-agnostic diagrams are experimental; for now they reuse the AWS composition, layout, and routing conventions while using their own provider icons.

When a request does not name a provider, use the cloud-agnostic grammar without asking. When provider wording conflicts, or a multi-cloud request does not establish a clear primary provider, ask the user to choose or clarify the scope before writing the architecture brief or diagram. A source file has one primary provider grammar, so do not silently mix provider catalogs.

## Describe meaning before placement

Describe what the diagram needs to communicate:

- The title and provider context.
- The services and boundaries that actually exist.
- The main request or event path, in order.
- Supporting relationships that should be visually quieter.
- Any labels that must appear exactly as written.

Coordinates are usually unnecessary. Let the engine create an initial layout, then make visual decisions in Studio once you can see the result.

## Refine an existing diagram

Name the file explicitly. Ask the agent to preserve its saved view and keep unrelated services and connections intact.

```text
Update diagrams/payments/diagram.dgm to add a queue before the worker, and
update diagrams/payments/architecture-brief.md with the semantic change.
Preserve the current labels and saved view wherever possible.
Do not change the other diagrams or the reference examples.
Keep the `.dgm` source valid after the edit.
```

The source and visual overrides share one file. An agent that rewrites the entire document carelessly can discard your manual work, so preservation should be part of the request.

## Review the result

Validation finds structural mistakes, but it cannot tell whether the diagram matches the real system. Check the boundaries, service choices, and direction of each connection yourself.

Open the file in Studio, review the layout, and refine a dense connection if
needed. Then commit the diagram with the implementation or proposal it
explains.

For automation, pin the CLI version you have tested instead of resolving `@latest` on every run.
