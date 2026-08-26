---
title: Export and share
description: Take a diagram into a README, a review, or a presentation without creating another layout to maintain.
section: Make diagrams
order: 5
---
Every export starts with the same compiled geometry. Changing formats does not trigger a different layout algorithm.

Keep the `.dgm` file as your editable source, even when you share a picture. A downloaded image is useful for a conversation; the source is what lets you update the architecture later.

## Choose a format

| Format | A useful place for it |
| --- | --- |
| SVG | READMEs, web pages, and diagrams that need to stay sharp when zoomed |
| PNG | Documents and slide decks that expect a conventional image |
| JPEG, WebP, GIF | Workflows that specifically need those image formats |
| PDF | Reviews, printing, and sharing a document |
| Standalone HTML | A portable page containing the diagram |
| XML, JSON, URL payload | Structured output or a supported data-sharing workflow |
| .dgm | Editing, version control, and a durable source of truth |

Studio exposes the formats the browser supports. WebP, for example, is hidden when that browser cannot encode it. A URL payload is not a promise of a hosted sharing service, and XML should not be assumed to be an editable draw.io document.

## Render SVG from the terminal

```bash
npx create-dumb-diagrams@latest render diagrams/payments.dgm --output payments.svg
```

Replace the input with your actual filename. If you omit `--output`, the CLI writes `output.svg`.

The CLI’s render command produces portable SVG. Use Studio for the other export formats; the CLI does not have a `--format png` flag.

## Take the icons with you

The live browser editor can load catalog icons as separate SVG assets. Portable exports inline those icons, so the diagram does not depend on a running local server to display correctly.

User-embedded SVG is sanitized by the runtime. Provider icons retain their upstream terms even when they appear in your export; see the project’s icon notices for provenance.

## Keep the source in review

A useful pull request includes the `.dgm` change and, when the picture matters to the discussion, an exported SVG. The text diff shows what changed in the system; the picture shows what that means at a glance.

For automated renders, pin the CLI version and keep the source and catalog version stable. Determinism depends on the same inputs, not just the same filename.
