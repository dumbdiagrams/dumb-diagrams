# Example diagrams

These files are style references for creating new `.dgm` diagrams. They are
not canonical answers and their architectures should not be copied blindly.

Each reference has two parts:

- `prompts/<name>.md` is the natural-language request.
- `<name>.dgm` is the resulting source structure.

Read both files as a pair. The prompt explains the intended composition and
the `.dgm` file shows how that intent maps to grammar, nesting, ids, edges, and
layout metadata.

Before creating or editing a project diagram:

1. Read `../DUMB_DIAGRAMS.md`.
2. Read `../diagrams/README.md` and list the existing files under `../diagrams/`.
3. Choose the closest example and inspect its source, not only its rendered view.
4. For a new request, create a new descriptive `.dgm` under `../diagrams/`.
   Edit an existing project file only when the user names it explicitly.
5. Preserve the example's explicit composition, hierarchy, labels, stable ids,
   numbered `step` edges, `from`/`to` direction hints, and dashed peer edges.
6. Use automatic layout unless the request explicitly calls for a `view` block,
   manual node positions, or manual edge routes.
7. Adapt the composition to the requested architecture instead of adding
   plausible services that were not requested.
8. Author general logical containers only as `cloud-agnostic.boundary`; the
   examples deliberately avoid the legacy `group` shorthand.

Available reference pairs:

- `prompts/aws-high-availability-web-app.md` + `aws-high-availability-web-app.dgm`
- `prompts/aws-data-transfer-hub.md` + `aws-data-transfer-hub.dgm`
- `prompts/bedrock-claims-processing.md` + `bedrock-claims-processing.dgm`
- `prompts/simple-serverless-web-application.md` + `simple-serverless-web-application.dgm`
- `prompts/image-thumbnail-pipeline.md` + `image-thumbnail-pipeline.dgm`
- `prompts/asynchronous-report-generation.md` + `asynchronous-report-generation.dgm`
- `prompts/event-driven-order-fulfillment.md` + `event-driven-order-fulfillment.dgm`
- `prompts/azure-private-app-service.md` + `azure-private-app-service.dgm`

The examples intentionally use a defined prompt style: title and grammar first,
composition and hierarchy next, then numbered connections and routing constraints.
That structure gives coding agents a concrete pattern to follow and makes their
outputs easier to compare.

When a prompt names a cloud service, look up its canonical type in the project
root's `CATALOG.md` before writing the `.dgm`. The type selects the icon; the
quoted label only changes what is displayed. Use `CATALOG.json` when a tool or
script needs the machine-readable inventory.

## Prompt shape

Use this structure when writing a request for an agent:

```text
Create a diagram titled "..." using the ... grammar and a left-to-right flow.
Use automatic layout only: do not add a view block, manual node positions, or
manual edge routes.

Composition and hierarchy:
- Describe the actors, cloud/account/region/network boundaries, logical boundaries, and
  resources in their intended visual order.
- State exact labels, nesting, repeated zones, and any compact layout goals.

Connections and numbered stages:
1. Describe the first directed connection, including its sides and badge.
2. Describe the next stage and identify dashed peer relationships separately.
- Add labels and explicit direction hints where they matter.

Keep the composition easy to scan. Use orthogonal connectors, separate lanes,
and no overlaps, loops, dead ends, or redundant resources.
```
