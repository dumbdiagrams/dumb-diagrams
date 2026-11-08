---
title: Using Studio
description: Edit source and fine-tune a diagram visually in hosted or local Studio.
seoTitle: Architecture Diagram Editor and Studio
seoDescription: Learn to edit .dgm source, refine layouts on the canvas, and export diagrams in hosted or local Studio.
section: Make diagrams
order: 10
---
Studio is where you review a generated diagram and make it yours. Edit the `.dgm` source, move and resize items on the canvas, add resources or notes, organise layers, adjust connectors, and export the result. Source and visual changes stay together in the same file.

You can [open the hosted Studio](https://studio.dumbdiagrams.com) in your browser, or run Studio locally with the CLI. The hosted editor is a static browser application: diagrams stay in your browser or in files you choose. Dumb Diagrams does not upload, collect, store, or process diagram contents on its servers, and Studio has no analytics or diagram telemetry.

The hosted editor does not replace the project workflow. Install the CLI and run `dgm init` when you want the project files, agent instructions, requirements, and Git-based workflow. Examples and existing `.dgm` files can still be opened in the browser without setting up a project.

Chromium-based desktop browsers are the first-class Studio target. WebKit and
Firefox are best-effort compatibility targets, and native Safari is not a
release target.

## Open and edit a file

For the hosted editor, open [studio.dumbdiagrams.com](https://studio.dumbdiagrams.com) and choose **Open** to select any `.dgm` file. For the local editor, run `dumbdiagrams studio` and choose **Open**. Keep the terminal running while you work. Local Studio listens on `127.0.0.1`, port 4788, or a free port if that one is taken.

Moving an item never rearranges the rest of the diagram. Other items and connector paths stay where they are, and the moved item's connections redraw along the [straightest clear path](../routing/#default-connector-shape). **Auto-fix** repairs overlaps and crossings in one step. The button shows a spinner while it works, and Undo restores the previous layout.

A partially typed source edit may be temporarily invalid. Studio keeps the last valid compilation visible while you fix it. If the picture seems unchanged, check the validation feedback before assuming the edit was saved.

For a keyboard-friendly overview of the diagram, open **Canvas items**. It lists boundaries, resources, connectors, and annotations and lets you focus or safely delete the selected item.

## Fine-tune the details

Select a boundary, resource, or connector to edit it on the right: line and fill, label position, icon size, step numbers, connector meaning, and route. The defaults work without changes, so these are optional refinements. Clicking a warning in the validation panel selects the item it refers to.

## Save and work with other editors

In browsers with the File System Access API, **Save** writes back to the opened file and **Save As** picks a new one. Before writing, Studio checks whether another editor changed or deleted the file and asks you to reload or overwrite. Other browsers download the updated `.dgm` instead, without that check. Saved source is canonical, so diffs stay small.

Workspace recovery is stored in browser storage. Clearing site data can remove browser-saved work, so save important `.dgm` files. Saving and exporting create files on your device. The host receives only the ordinary requests needed to deliver the application and bundled icons, including normal request metadata and requested icon paths.
