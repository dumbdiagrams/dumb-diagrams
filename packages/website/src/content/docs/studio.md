---
title: Using Studio
description: Edit source and diagram together, with a clear distinction between browser storage and files on disk.
section: Make diagrams
order: 4
---
Studio is the visual editor around the diagram engine. You can pan and zoom, move and resize items, change source, adjust connectors, work with multiple diagrams, and export the result.

The diagram you see is the runtime’s SVG. The editor adds interaction around it; it does not maintain a separate drawing format.

## Open a local project

```bash
npx create-dumb-diagrams@latest studio diagrams
```

Pass a folder to work with its diagrams, or a `.dgm` file to open that specific document. The default server address is `127.0.0.1` on port `4788`. Keep the terminal process running while Studio is connected.

If that port is occupied:

```bash
npx create-dumb-diagrams@latest studio diagrams --port 4799
```

Use `--no-open` if you want the server to print its address without launching a browser.

## Edit the picture or the source

The canvas gives you pan, zoom, fit-to-content, selection, and visual adjustments. The source editor lets you change the architecture directly. Both work with the same document.

A partially typed source edit may be temporarily invalid. Studio can keep the last valid compilation visible while you fix the source. If the picture seems unchanged after an edit, check the validation feedback before assuming the change was saved successfully.

Start with automatic layout, then move the items that need attention. For dense connections, use a manual route rather than trying to trick the layout with unrelated changes.

## Understand where saves go

| Mode | How you start it | Where work is kept |
| --- | --- | --- |
| Local Studio | The CLI’s `studio` command | Real `.dgm` files through the local server |
| Standalone browser Studio | A static deployment or the editor dev server | Browser workspace storage and explicit downloads |

The same editor bundle supports both modes. At startup it checks for the local API. Without that API, it stays in browser mode.

> A static browser page cannot silently save into your repository. If you want an agent and Studio to edit the same file on disk, start Studio through the CLI.

## Work alongside an editor or agent

The local server watches the diagram’s directory and notices external changes. It also tracks the revision that each save was based on.

If another editor changes the file before Studio saves, the server rejects the stale write. Studio asks whether to reload the disk version or keep the browser version. Read the choice carefully: preserving the wrong version can discard the other edit.

Writes are atomic, and reconnecting after sleep refreshes the document and connection state. A dropped internet connection does not affect local Studio. It only needs the server on your machine.

## Keep the local server local

Use the loopback address by default. If you expose Studio with `--host`, the CLI adds a per-process capability token to the launch URL and requires it for API access.

Treat that URL as a secret. The bridge is a development tool, not a public hosting service. Remote access needs a trusted network or a properly authenticated TLS proxy.

Studio is designed for desktop use. The site works on a phone, but detailed diagram editing is more comfortable in a wide window.
