---
title: Welcome to Dumb Diagrams
description: Create portable architecture diagrams as .dgm files and refine them in local Studio.
section: Start here
order: 0
---
You already know the important parts of your architecture: its services, boundaries, and request paths. Dumb Diagrams turns that understanding into a readable `.dgm` file. The engine places resources, draws connections, and checks the result. Studio lets you refine the layout without losing the source.

**New here? [Make your first diagram](./quick-start/).** You need Node.js 24 or newer and a terminal. You do not need an account or a hosted workspace.

If you use a coding agent, set it up separately. Codex, Claude Code, Cursor, Antigravity, and open-source alternatives can work with the project. [Work with an agent](./agent-workflow/) explains how to provide the project context.

## Diagrams as code

A diagram is an ordinary text file. It describes resources, their groups, and their connections. Visual changes made in Studio can be saved in that same file.

Keeping architecture in version-controlled text makes it easy for people and coding agents to review and update. Store `.dgm` files wherever they belong, and use **Open** in Studio to select any local file.

## Choose your starting point

| Task | Start here |
| --- | --- |
| Prepare a repository and open Studio | [Quick start](./quick-start/) |
| Ask an agent for a first draft | [Work with an agent](./agent-workflow/) |
| Follow a complete AWS example | [Cross-account data transfer walkthrough](./aws-cross-account-data-transfer/) |
| Follow a complete Azure example | [Serverless document processing walkthrough](./azure-document-processing-pipeline/) |
| Understand the source language | [The .dgm format](./source-format/) |
| Move things around and save your work | [Using Studio](./studio/) |
| Put a diagram in a document or review | [Export and share](./exports/) |
| Work on the visual identity or interface | [Brand and interface](./design-system/) |
| Understand what happens inside the engine | [How the engine works](./how-it-works/) |

AWS is the most mature provider path. Azure, Google Cloud, and cloud-agnostic diagrams are available but still experimental.

Dumb Diagrams is a local architecture editor, not a freeform illustration tool, live cloud inventory, or hosted whiteboard. Automatic layout gives you a first pass; Studio is where you make the final visual decisions.
