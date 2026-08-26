---
title: Icons and providers
description: Choose real catalog types, keep provider boundaries meaningful, and understand where the assets come from.
section: Under the hood
order: 9
---
The catalog is more than a folder of icons. Each type has provider information, a label, an icon, and rules that help the engine understand where it belongs.

The grammar is a separate concern: it applies visual conventions so the catalog’s resources look coherent together.

## Use the exact type

Every initialized project includes `CATALOG.md` and `CATALOG.json`. Search those files for a service and copy its canonical type.

For example, the canonical Lambda type is `aws.aws-lambda`. The quoted label can be “Payment handler,” but the label does not choose the icon.

Some older aliases are still accepted for compatibility. Use canonical types in new files so your source stays clear and predictable. An agent should look up a type rather than guess one from the service’s display name.

## Know the provider scope

AWS has the strongest grammar, examples, and visual guidance. Azure, Google Cloud, and cloud-agnostic assets are also present in the catalog.

An available icon does not imply that every provider has identical grammar coverage. Start with the catalog’s rules and the nearest checked-in example when working outside the main AWS path.

## How assets reach the browser

Reviewed upstream inputs and source locks live under `assets/catalog/`. The generator creates the runtime inventory. A staging script gives selected SVGs browser-safe names and copies them into Studio’s public assets.

The browser uses those SVGs as separate files. Portable exports inline the same icons. Upstream PNG files are source inputs, not a reason to send a second raster copy of the catalog to the browser.

User-embedded SVG is different: it travels inside the document and is subject to size limits and sanitization.

## Update the catalog deliberately

For repository contributors:

```bash
pnpm icons:check
pnpm icons:build
```

`icons:check` inspects the catalog inventory. `icons:build` generates the runtime data and stages browser assets. Run `pnpm icons:update` only when you intend to update the upstream inputs.

Do not edit a generated manifest or a staged icon as the source of a change. Update the reviewed inputs and rerun the workflow.

Provider assets retain their upstream terms. Read `ICON-NOTICES.md` and `assets/catalog/README.md` in the repository for notices, provenance, and the update process.
