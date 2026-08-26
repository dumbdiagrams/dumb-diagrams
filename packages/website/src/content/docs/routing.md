---
title: Layout and routing
description: How layout places boxes, how connections find paths, and when to choose a manual route.
section: Under the hood
order: 8
---
Automatic layout and automatic routing solve different problems. Layout gives the architecture space. Routing decides how the relationships travel through it.

Both are deterministic. Given the same document, catalog, and saved overrides, the engine makes the same choices. That predictability makes diagrams easier to review and regressions easier to spot.

## Layout begins with containment

Groups provide nested coordinate spaces and headers. Resource cards are measured as complete objects, including icons and labels.

Flow direction, group kinds, and resource roles influence placement. The engine then applies saved view overrides. An authored position remains exact while unplaced content receives the automatic layout.

For a new diagram, start without manual positions. You can see what needs adjustment once the default arrangement is visible.

## Connections take right-angle paths

The router uses horizontal and vertical segments. You may see this described as orthogonal or Manhattan routing.

The shortest path is not always the easiest to follow. The router considers collisions, crossings, unrelated junctions, shared corridors, crowded endpoints, bends, distance, and backtracking.

It first tries inexpensive templates for common shapes. When those are blocked, it can use grid-based A* search. It simplifies routes only when doing so does not reintroduce a conflict.

## Some decisions are stronger than others

Pinned manual routes and exact fractional ports reserve space first. Less flexible flows are planned before easy local edges, while the final rendering keeps the document’s edge order.

A face-only port such as `from e` expresses a preference for a side. An exact fractional port constrains a particular point. Treat those as different promises: the more precisely you constrain endpoints, the less freedom the router has elsewhere.

Use a manual route when you have a visual requirement that the automatic route cannot express. That override is saved in the view and remains part of the document.

## Warnings identify tradeoffs

A diagram can be structurally valid and still have a crowded or awkward connection. Invariant checks make those compromises visible instead of silently pretending every result is ideal.

When a warning appears, check whether one view is trying to explain too much. A smaller diagram, a stronger grouping, or a manual route may help more than adding constraints.

The repository records a reviewed warning fingerprint for its example diagrams. A changed warning is a reason to inspect the picture, whether the warning was added or removed.

## For contributors

The routing priorities and contracts live in `packages/runtime/ROUTING.md`. Read them before changing router behavior. Use the existing examples and routing baseline checks to see how a change affects real diagrams, rather than a single synthetic route.
