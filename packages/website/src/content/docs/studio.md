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

Google Chrome is the recommended browser. Chromium-based desktop browsers are
the first-class Studio target. WebKit and Firefox are best-effort compatibility
targets, and native Safari is not a release target.

Brave disables the File System Access API by default. You can enable
`brave://flags/#file-system-access-api` and relaunch Brave, but this is an
experimental browser-wide flag; Studio may still need a site-specific file
grant. If the API is unavailable, Studio works in browser-only mode but cannot
live-sync changes to the local `.dgm` project file, so updates to Git-tracked
files are unavailable from Studio. You can still import and export `.dgm`
files.

## Open and edit a file

For the hosted editor, open [studio.dumbdiagrams.com](https://studio.dumbdiagrams.com) and choose **Open** to select any `.dgm` file. For the local editor, run `dumbdiagrams studio` and choose **Open**. Keep the terminal running while you work. Local Studio listens on `127.0.0.1`, port 4788, or a free port if that one is taken.

Moving an item never rearranges the rest of the diagram. Other items and connector paths stay where they are, and the moved item's connections redraw along the [straightest clear path](../routing/#default-connector-shape). **Auto-fix** repairs overlaps and crossings in one step. The button shows a spinner while it works, and Undo restores the previous layout.

A partially typed source edit may be temporarily invalid. Studio keeps the last valid compilation visible while you fix it. If the picture seems unchanged, check the validation feedback before assuming the edit was saved.

For a keyboard-friendly overview of the diagram, open **Canvas items**. It lists boundaries, resources, connectors, and annotations and lets you focus or safely delete the selected item.

## Fine-tune the details

Select a boundary, resource, or connector to edit it on the right: line and fill, label position, icon size, step numbers, connector meaning, and route. The defaults work without changes, so these are optional refinements. Clicking a warning in the validation panel selects the item it refers to.

For notes, code snippets, and plain text, choose a preset in **Size** or type a custom pixel value. Sizes from 6 to 96 px are supported, including fractional values such as 8.5 px. Valid changes preview immediately and keep their exact size in the `.dgm` file and when copied or pasted.

## Auto-save and live file updates

In Chrome or Edge, **File → Open** links Studio to your `.dgm` file. **File → Auto-save** is on by default: valid edits, including Undo and Redo, save after a short pause once write access is granted. The first **Save** or **Auto-save** action may ask for write access; opening a file does not. Until access is granted, edits remain unsaved. Turn auto-save off to save manually, or use **Save As** to choose a new file.

Changes from your agent or another editor appear automatically after about 1.5 seconds without another write. Studio keeps the last valid diagram during incomplete edits and asks you to review conflicts through **File changed**. Accepted external updates are undoable in the current session. Choose **File → Reload from disk** to check immediately. This works in hosted and local Studio.

Wait for **Live** before closing. If the status stays **Unsaved**, use **Save** to grant access and write pending changes.

**Browser only** means the tab is a snapshot. Use **Save As** to link a writable file; browsers without file linking download changes instead. Recovered tabs need linking again after a browser restart. Browser recovery can be lost when site data is cleared, so keep important work in `.dgm` files.
