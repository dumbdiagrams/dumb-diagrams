---
title: Work with an agent
description: Give your coding agent the architecture and a few useful constraints. Let the engine handle the layout.
section: Start here
order: 2
---
An agent is useful here because it can turn an architecture conversation into a structured file. It does not need to move hundreds of shapes around a canvas.

The initializer prepares the context: `DUMB_DIAGRAMS.md`, agent entry points, a catalog, and example diagrams paired with their original prompts. Use those files with your existing coding agent. Dumb Diagrams does not include a hosted model or automatically send it your project.

## Start with the project instructions

Ask the agent to read `DUMB_DIAGRAMS.md` and `examples/README.md`, then choose the closest example and prompt. The catalog is the reference for exact service types. A familiar service name is not always the type identifier the engine expects.

Here is a useful first request:

```text
Read DUMB_DIAGRAMS.md and the closest example.

Create diagrams/payments.dgm for our payments flow.
A customer calls an API Gateway endpoint. A Lambda handler
processes the request and writes to a DynamoDB ledger.
Keep the services inside an AWS Region and number the main
request path. Use the catalog’s exact service types.

Use automatic layout. Validate the result when you are done.
```

## Describe meaning before placement

A good prompt tells the agent what the diagram must communicate:

- The title and provider context.
- The services and boundaries that actually exist.
- The main request or event path, in order.
- Supporting relationships that should be visually quieter.
- Any labels that must appear exactly as written.

You usually do not need coordinates. Let the engine create an initial layout, then make visual decisions in Studio once you can see the result.

## Refine an existing diagram

Name the file explicitly. Ask the agent to preserve its saved view and keep unrelated services and connections intact.

```text
Update diagrams/payments.dgm to add a queue before the worker.
Preserve the current labels and saved view wherever possible.
Do not change the other diagrams or the reference examples.
Validate diagrams/ after the edit.
```

The source and visual overrides share one file. An agent that rewrites the entire document carelessly can discard your manual work, so preservation should be part of the request.

## Review the result together

Validation catches structural mistakes, but it cannot tell whether the system matches reality. Check the boundaries, service choices, and direction of each connection yourself.

Open the file in Studio, look for routing warnings, and refine a dense connection if needed. Then commit the diagram with the implementation or proposal it explains.

For repeatable automation, pin the CLI version you have tested instead of resolving `@latest` on every run.
