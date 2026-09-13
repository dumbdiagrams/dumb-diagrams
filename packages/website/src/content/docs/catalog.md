---
title: Icons and providers
description: Use canonical catalog types, preserve provider boundaries, and understand how assets are staged.
section: Make diagrams
order: 11
---
The catalog is more than a folder of icons. Each type includes provider information, a label, an icon, and rules that tell the engine where it belongs.

<figure class="mechanic-figure compact-doc-visual" aria-labelledby="catalog-contract-title">
  <div class="figure-heading"><div><span class="figure-kicker">CATALOG CONTRACT</span><h3 id="catalog-contract-title">A type carries rules with its icon</h3></div></div>
  <div class="catalog-flow"><span>provider<br/><b>aws</b></span><i>→</i><span>type<br/><b>aws.aws-lambda</b></span><i>→</i><span>icon + label<br/><b>AWS Lambda</b></span><i>→</i><span>containment<br/><b>allowed parents</b></span></div>
  <figcaption>Insertion and validation use the same catalog metadata, so a recognizable icon is not enough when its provider or parent is invalid.</figcaption>
</figure>

The grammar adds visual conventions so resources from the catalog work together as a system.

## Use canonical types

After `dumbdiagrams init`, the new project includes catalog guidance under
`.dumbdiagrams/`. Search those files for a service and copy its canonical type.

For example, the canonical Lambda type is `aws.aws-lambda`. The quoted label can be “Payment handler,” but the label does not choose the icon.

Older aliases remain accepted for compatibility. Use canonical types in new files so the source stays stable and readable. Look up a type instead of guessing from the service’s display name.

## Check provider coverage

AWS, Azure, Google Cloud, and cloud-agnostic authoring each have catalog and
curated-example coverage. Azure, GCP, and cloud-agnostic diagrams inherit the
same deterministic composition, layout, and routing conventions; GCP products
without a distinct official glyph are represented honestly with a reviewed
shared-category icon and marked accordingly in the catalog.

An available icon does not imply that the provider offers a distinct product
glyph. When working outside the AWS path, start with the provider catalog rules
and nearest checked-in example.

## Asset pipeline

Reviewed upstream assets and source locks live under `assets/catalog/`. The generator creates the runtime inventory. A staging script gives selected SVGs browser-safe names and copies them into Studio’s public assets.

The browser uses those SVGs as separate files. Portable exports inline the same icons. Upstream PNG files are source inputs, not a reason to send a second raster copy of the catalog to the browser.

User-embedded SVG is different: it travels inside the document and is subject to size limits and sanitization.

## Update the catalog

For repository contributors:

```bash
pnpm icons:check
pnpm icons:build
```

`icons:check` inspects committed catalog sources and manifest metadata, so it is
self-sufficient on a clean checkout. `icons:build` generates the runtime data
and stages ignored browser assets. Run `pnpm icons:update` only when you intend
to update the upstream inputs.

Do not edit a generated manifest or a staged icon as the source of a change. Update the reviewed inputs and rerun the workflow.

Provider assets retain their upstream terms. Read `ICON-NOTICES.md` and `assets/catalog/README.md` in the repository for notices, provenance, and the update process.
