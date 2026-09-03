---
title: Using Studio
description: Edit any portable .dgm file locally, independent of the directory where Studio starts.
section: Make diagrams
order: 4
---
Studio is the generic visual editor around the diagram engine. You can pan and
zoom, move and resize items, change source, adjust connectors, work with tabs
and recent files, and export the result.

The diagram you see is the runtime’s SVG. The editor adds interaction around it; it does not maintain a separate drawing format.

## Start Studio and open a file

```bash
npm install -g create-dumb-diagrams
dumbdiagrams studio
```

Studio is independent of the directory where it was launched. Choose **Open**
to select any `.dgm` file from anywhere on disk. Keep the terminal process
running while Studio is connected.

## Edit the picture or the source

The canvas gives you pan, zoom, fit-to-content, selection, and visual adjustments. The source editor lets you change the architecture directly. Both work with the same document.

A partially typed source edit may be temporarily invalid. Studio can keep the last valid compilation visible while you fix the source. If the picture seems unchanged after an edit, check the validation feedback before assuming the change was saved successfully.

Studio is keyboard-friendly: use Left/Right/Home/End on the workspace tabs to
move and activate tabs. The **Canvas items** control opens an accessible list of
groups, resources, edges, and annotations; use the arrow keys to select an item,
Delete or Backspace to invoke its normal safe delete action, and **Focus canvas**
to move keyboard focus to the diagram. Clipboard permission failures are reported
with recovery guidance, while Studio keeps its internal source/selection copy
available when possible.

Start with automatic layout, then move the items that need attention. For dense connections, use a manual route rather than trying to trick the layout with unrelated changes.

## Understand where saves go

In browsers with the File System Access API, Open keeps a handle to the selected
file and Save writes back to it. Save As asks for a new destination. File handles
are not retained across a page reload, so reopen the file when needed.

Other browsers use a standard file chooser and download the updated `.dgm` when
you save. In either case the source remains an ordinary portable file; Studio
does not register it with a project or upload it to a Dumb Diagrams service.

## Work alongside an editor or agent

Studio does not watch selected files live, but File System Access saves compare
the on-disk text with the last source snapshot before overwriting. If another
editor changed or deleted the file, Studio stops and offers a reload or an
explicit overwrite choice. Standard chooser/download saves cannot perform that
comparison, so reopen the file when coordinating edits through that fallback.

Studio binds to `127.0.0.1` and is intended for local use. It is not a hosted service or a public server.

Studio is designed for desktop use. The site works on a phone, but detailed diagram editing is more comfortable in a wide window.
