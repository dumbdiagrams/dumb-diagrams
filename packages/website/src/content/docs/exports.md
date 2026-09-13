---
title: Export and share
description: Export a diagram for a README, review, or presentation.
section: Make diagrams
order: 14
---
Every export starts with the same compiled geometry. Changing formats does not trigger a different layout algorithm. Keep the `.dgm` file as the editable source when you share an image: the image is convenient to send, while the source lets you update the architecture later.

## Choose a format

| Format | Good for |
| --- | --- |
| SVG | READMEs, web pages, and diagrams that need to stay sharp when zoomed |
| PNG | Documents and slide decks that expect a conventional image |
| JPEG, WebP, GIF | Workflows that specifically need those image formats |
| PDF | Reviews, printing, and sharing a document |
| Standalone HTML | A portable page containing the diagram |
| XML, JSON, URL payload | Structured output or a supported data-sharing workflow |
| .dgm | Editing, version control, and a durable source of truth |

Studio exposes the formats the browser supports. WebP, for example, is hidden when that browser cannot encode it. A URL payload does not provide a hosted sharing service, and XML is not necessarily an editable draw.io document.

## Export from Studio

Open the `.dgm` file in Studio, then use its export controls to produce SVG, PNG, PDF, or another supported format. The export uses the same geometry as the editor. Keep the original `.dgm` beside it so the diagram stays editable.

Portable exports inline catalog icons, so they do not depend on a running local server to display correctly. User-embedded SVG is sanitized by the runtime. Provider icons retain their upstream terms in exports; see the project’s icon notices for provenance.

For a pull request, include the `.dgm` change and, when the image matters to the discussion, an exported SVG. The text diff records the system change; the image shows its effect. For automated renders, pin the CLI version and keep the source and catalog versions stable. Determinism depends on matching inputs, not filenames alone.

<details>
<summary>Image size limits</summary>

<figure class="mechanic-figure compact-doc-visual" aria-labelledby="export-meter-title">
  <div class="figure-heading"><div><span class="figure-kicker">RASTER ALLOCATION</span><h3 id="export-meter-title">Check both axes and total pixels</h3></div></div>
  <div class="export-meter"><span><b>width × scale</b>≤ 16,384</span><span><b>height × scale</b>≤ 16,384</span><span><b>output width × output height</b>≤ 16,777,216</span></div>
  <figcaption>Vector SVG remains sharp without allocating a raster canvas. PNG and PDF raster paths apply scale or DPI before enforcing the limits.</figcaption>
</figure>

</details>
