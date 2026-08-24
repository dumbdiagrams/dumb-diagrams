# Example diagrams

These files are style references for creating new `.dgm` diagrams. They are
not canonical answers and their architectures should not be copied blindly.

Before editing a project diagram:

1. Read `../DUMB_DIAGRAMS.md`.
2. Choose the closest example and inspect its source, not only its rendered view.
3. Preserve the example's explicit composition, hierarchy, labels, stable ids,
   numbered `step` edges, `from`/`to` direction hints, and dashed peer edges.
4. Use automatic layout unless the request explicitly calls for a `view` block,
   manual node positions, or manual edge routes.
5. Adapt the composition to the requested architecture instead of adding
   plausible services that were not requested.

The examples intentionally use a defined prompt style: title and grammar first,
composition and hierarchy next, then numbered connections and routing constraints.
That structure gives coding agents a concrete pattern to follow and makes their
outputs easier to compare.

## Prompt shape

Use this structure when writing a request for an agent:

```text
Create a diagram titled "..." using the ... grammar and a left-to-right flow.
Use automatic layout only: do not add a view block, manual node positions, or
manual edge routes.

Composition and hierarchy:
- Describe the actors, cloud/account/region/network boundaries, groups, and
  resources in their intended visual order.
- State exact labels, nesting, repeated zones, and any compact layout goals.

Connections and numbered stages:
1. Describe the first directed connection, including its sides and badge.
2. Describe the next stage and identify dashed peer relationships separately.
- Add labels and explicit direction hints where they matter.

Keep the composition easy to scan. Use orthogonal connectors, separate lanes,
and no overlaps, loops, dead ends, or redundant resources.
```
