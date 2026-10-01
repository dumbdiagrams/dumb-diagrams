---
title: Using Studio
description: Edit source and fine-tune a diagram visually in the local Studio.
section: Make diagrams
order: 10
---
Studio is where you review a generated diagram and make it yours. Edit the `.dgm` source, move and resize items on the canvas, add resources or notes, organise layers, adjust connectors, and export the result. Source and visual changes stay together in the same file.

Chromium-based desktop browsers are the first-class Studio target. WebKit and
Firefox are best-effort compatibility targets, and native Safari is not a
release target.

<figure class="studio-overview">
  <img src="../../docs-assets/studio-overview.png" alt="Dumb Diagrams Studio showing an AWS serverless architecture, the canvas, and the boundaries panel" width="2000" height="1051" />
  <figcaption>The left dock opens boundaries, resources, text, notes, layers, and source. Select an item on the canvas to edit its details on the right.</figcaption>
</figure>

## Open and edit a file

Run `dumbdiagrams studio` and choose **Open** to select any `.dgm` file. Keep the terminal running while you work. Studio listens on `127.0.0.1`, port 4788, or a free port if that one is taken.

Moving an item never rearranges the rest of the diagram. Other items and connector paths stay where they are, and the moved item's connections redraw along the [straightest clear path](../routing/#default-connector-shape). **Auto-fix** repairs overlaps and crossings in one step. The button shows a spinner while it works, and Undo restores the previous layout.

A partially typed source edit may be temporarily invalid. Studio keeps the last valid compilation visible while you fix it. If the picture seems unchanged, check the validation feedback before assuming the edit was saved.

For a keyboard-friendly overview of the diagram, open **Canvas items**. It lists boundaries, resources, connectors, and annotations and lets you focus or safely delete the selected item.

## Fine-tune the details

Select a boundary, resource, or connector to edit it on the right: line and fill, label position, icon size, step numbers, connector meaning, and route. The defaults work without changes, so these are optional refinements. Clicking a warning in the validation panel selects the item it refers to.

<div class="studio-detail-grid">
  <figure>
    <img src="../../docs-assets/studio-boundary-details.png" alt="Boundary details with label position, line style, colour, and fill controls" width="570" height="850" loading="lazy" />
    <figcaption>Boundary appearance</figcaption>
  </figure>
  <figure>
    <img src="../../docs-assets/studio-service-details.png" alt="Resource details with icon size and label position controls" width="556" height="700" loading="lazy" />
    <figcaption>Icon and label</figcaption>
  </figure>
  <figure>
    <img src="../../docs-assets/studio-connector-details.png" alt="Connector details with line style, colour, and meaning controls" width="722" height="900" loading="lazy" />
    <figcaption>Connector appearance</figcaption>
  </figure>
</div>

## Save and work with other editors

In browsers with the File System Access API, **Save** writes back to the opened file and **Save As** picks a new one. Before writing, Studio checks whether another editor changed or deleted the file and asks you to reload or overwrite. Other browsers download the updated `.dgm` instead, without that check. Saved source is canonical, so diffs stay small. Nothing is uploaded.
