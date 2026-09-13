---
title: Using Studio
description: Edit any .dgm file locally in Studio, wherever the file lives.
section: Make diagrams
order: 10
---
Studio lets you edit the source and adjust the diagram in one place. You can pan and zoom, move resources, move and resize boundaries and annotations, change source, adjust connectors, work with tabs and recent files, and export the result.

<figure class="mechanic-figure compact-doc-visual" aria-labelledby="studio-state-title">
  <div class="figure-heading"><div><span class="figure-kicker">EDITOR STATE</span><h3 id="studio-state-title">Source, preview, and disk are separate</h3></div></div>
  <div class="compact-flow"><span>edited source</span><b>compile</b><span>last good preview</span><b>save</b><span>disk file</span></div>
  <figcaption>A compile error keeps the last good preview. An external file change opens a conflict choice before Studio writes.</figcaption>
</figure>

The diagram you see is the runtime’s SVG. The editor adds interaction around it; it does not maintain a separate drawing format.

## Open and edit a file

```bash
npm install -g create-dumb-diagrams
dumbdiagrams studio
```

Studio is independent of the directory where it was launched. Choose **Open** to select any `.dgm` file from anywhere on disk. Keep the terminal process running while Studio is connected.

The canvas provides pan, zoom, fit-to-content, selection, and visual adjustments. Resources retain their catalog-defined icon size and can be moved; boundaries and annotations can be moved and resized. The source editor changes the architecture directly. Both work with the same document.

A partially typed source edit may be temporarily invalid. Studio keeps the last valid compilation visible while you fix it. If the picture seems unchanged, check the validation feedback before assuming the edit was saved.

Studio is keyboard-friendly: use Left/Right/Home/End on the workspace tabs to move and activate tabs. The **Canvas items** control opens an accessible list of groups, resources, edges, and annotations; use the arrow keys to select an item, Delete or Backspace to invoke its normal safe delete action, and **Focus canvas** to move keyboard focus to the diagram. Clipboard permission failures include recovery guidance, while Studio keeps its internal source and selection copy available when possible.

Start with automatic layout, then move the items that need attention. For dense connections, use a manual route rather than trying to influence the layout with unrelated changes.

## Save and work with other editors

In browsers with the File System Access API, **Open** keeps a handle to the selected file and **Save** writes back to it. **Save As** asks for a new destination. File handles are not retained across a page reload, so reopen the file when needed.

Other browsers use a standard file chooser and download the updated `.dgm` when you save. In either case, the source remains an ordinary portable file; Studio does not register it with a project or upload it to a Dumb Diagrams service.

Studio does not watch selected files live. File System Access saves compare the on-disk text with the last source snapshot before overwriting. If another editor changed or deleted the file, Studio stops and offers a reload or explicit overwrite choice. Standard chooser/download saves cannot perform that comparison, so reopen the file when coordinating edits through that fallback.

Studio binds to `127.0.0.1` and is intended for local use. It is not a hosted service or a public server. The site works on a phone, but detailed diagram editing is more comfortable in a wide desktop window.
