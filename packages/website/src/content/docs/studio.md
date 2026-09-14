---
title: Using Studio
description: Edit source and fine-tune a diagram visually in the local Studio.
section: Make diagrams
order: 10
---
Studio is where you review a generated diagram and make it yours. Edit the `.dgm` source, move and resize items on the canvas, add resources or notes, organise layers, adjust connectors, and export the result. Source and visual changes stay together in the same file.

<figure class="studio-overview">
  <img src="../../docs-assets/studio-overview.png" alt="Dumb Diagrams Studio showing an AWS serverless architecture, the canvas, and the boundaries panel" width="2000" height="1051" />
  <figcaption>The left dock opens boundaries, resources, text, notes, layers, and source. Select an item on the canvas to edit its details on the right.</figcaption>
</figure>

## Open and edit a file

```bash
npm install -g create-dumb-diagrams
dumbdiagrams studio
```

Studio is independent of the directory where it was launched. Choose **Open** to select any `.dgm` file from anywhere on disk. Keep the terminal process running while Studio is connected.

Use the canvas to pan, zoom, select, and position items. The left dock adds architecture content and opens the layer list or source editor. Start with automatic layout, then move only what needs attention.

A partially typed source edit may be temporarily invalid. Studio keeps the last valid compilation visible while you fix it. If the picture seems unchanged, check the validation feedback before assuming the edit was saved.

For a keyboard-friendly overview of the diagram, open **Canvas items**. It lists boundaries, resources, connectors, and annotations and lets you focus or safely delete the selected item.

## Fine-tune the details

Select a boundary, resource, or connector to open its details on the right. Defaults give you a sensible architecture diagram immediately. AWS boundaries, for example, begin with colours based on the official AWS architecture guidelines. You can still change the line and fill, use a solid or dashed style, and move the label.

Resources keep their provider icon by default, while the inspector lets you change details such as icon size and label position. For connectors, you can add a step number, choose a solid or dashed line, change its colour and meaning, or adjust its route. These are optional refinements, not a checklist you need to work through.

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

In browsers with the File System Access API, **Save** writes back to the file you opened and **Save As** asks for a new destination. Reopen the file after a page reload.

Other browsers download the updated `.dgm` when you save. Either way, Studio does not register the file with a project or upload it to a Dumb Diagrams service.

Studio does not watch files live. Before writing through the File System Access API, it checks whether another editor changed or deleted the file and asks you to reload or explicitly overwrite. The download fallback cannot make that check.

Studio runs locally on `127.0.0.1`; it is not a hosted workspace or a public server. A wide desktop window works best.
