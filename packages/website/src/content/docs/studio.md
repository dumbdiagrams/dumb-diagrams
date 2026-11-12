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

**File → Auto-save**, immediately below **Save**, is checked by default. Valid changes to a linked file save after a short pause, including canvas changes, source edits, Undo, and Redo. Each external file update accepted by Studio becomes one undoable change in the current session, so Undo can restore the previous diagram and autosave it back to the `.dgm`. Turn Auto-save off to save manually; the preference stays in this browser.

Allow write access when the browser asks after opening a file. If you decline or the browser later revokes access, Studio keeps your edits and shows the failed save. Use **Save** to grant access and retry; background saving never repeatedly opens permission prompts.

The file indicator distinguishes **Live** (up to date), **Saving…**, **Unsaved**, **File changed**, and **Save failed**. Studio preserves both versions when an external edit conflicts with unsaved Studio work; it does not silently overwrite the file. Read or write failures keep your Studio edits and remain visible until resolved. Closing while linked changes are still pending triggers the browser's exit warning. Waiting for **Live** confirms the file write has finished; saving during browser shutdown is only best effort.

**Browser only** means the tab is a browser snapshot rather than a linked file. Use **Save As** to choose a writable file and enable file autosave. Recovered tabs retain their browser copy but need to be linked again after a browser restart. Undo history is kept for the current session.

When you open a file through **File → Open** in Chrome or Edge, a **Live** indicator confirms that Studio is linked to the file. Edits from your coding agent or another editor refresh automatically after about 1.5 seconds without another observed write. Studio keeps the last valid diagram visible during partial or invalid writes. If you have unsaved Studio edits, **File changed** lets you review before replacing them. Click the indicator or choose **File → Reload from disk** to check immediately. Automatic refresh works the same in hosted and local Studio; files imported through a fallback upload picker remain snapshots.

Workspace recovery is stored in browser storage. Clearing site data can remove browser-saved work, so save important `.dgm` files. Saving and exporting create files on your device. The host receives only the ordinary requests needed to deliver the application and bundled icons, including normal request metadata and requested icon paths.
