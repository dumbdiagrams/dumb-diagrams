---
title: Welcome to Dumb Diagrams
description: A small language for architecture diagrams, a predictable engine, and a local editor for the finishing touches.
section: Start here
order: 0
---
You probably already know the interesting parts of your architecture: which services exist, where the boundaries are, and what happens when someone makes a request. Getting that understanding onto a page should be the easy part.

Dumb Diagrams gives you a readable `.dgm` file to describe the system. The engine places the resources, draws the connections, and checks the result. Studio lets you refine it visually without losing the source.

**New here? [Make your first diagram](./quick-start/).** You need Node.js 24 or newer and a terminal. No account, hosted workspace, or AI subscription is required by Dumb Diagrams.

## The file comes first

A diagram is a normal text file. It describes resources, the groups they belong to, and the connections between them. When you make a visual adjustment in Studio, that decision can be saved in the same file.

That means you can keep diagrams beside your code, review changes in Git, and ask a coding agent to update a diagram when the system changes. Studio is a useful way to work with the file; it is not the only way.

## Choose your starting point

| You want to… | Start here |
| --- | --- |
| Create a project and open Studio | [Quick start](./quick-start/) |
| Ask an agent for a useful first draft | [Work with an agent](./agent-workflow/) |
| Understand the source language | [The .dgm format](./source-format/) |
| Move things around and save your work | [Using Studio](./studio/) |
| Put a diagram in a document or review | [Export and share](./exports/) |
| Understand what happens inside the engine | [How the engine works](./how-it-works/) |

## What it is good at

Dumb Diagrams is opinionated about architecture diagrams. Nested cloud boundaries, service icons, numbered request paths, and right-angle connectors are part of the model. The same source, catalog, and saved view produce the same layout and SVG.

AWS is the most developed path today. The catalog also contains Azure, Google Cloud, and cloud-agnostic assets, but the grammar and examples are strongest for AWS.

## A few boundaries

This is not a freeform illustration tool, a live inventory of your cloud account, or a hosted collaborative whiteboard. The editor is designed for desktop use; around 1280 pixels wide is a comfortable starting point.

Dense diagrams can still need a human decision about a connector. Studio gives you manual routes for those cases. An automatic layout is a first pass, not a claim that every system fits neatly into a rectangle.
