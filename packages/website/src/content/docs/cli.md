---
title: Command reference
description: Create projects, open Studio, validate source, and export diagrams from the command line.
section: Make diagrams
order: 6
---
Use `npx create-dumb-diagrams@latest` followed by a command. A global install also provides the aliases `dumbdiagrams` and `dgm`.

Use the installed version for the current flag list:

```bash
npx create-dumb-diagrams@latest help
npx create-dumb-diagrams@latest --version
```

## Create a project

```bash
npx create-dumb-diagrams@latest init my-architecture --name "My architecture" --yes
```

`npm create dumb-diagrams@latest` is a shortcut for initialization. Use `init` when you want the command-style form.

| Option | What it controls |
| --- | --- |
| `[directory]` or `--directory` | Where the project is created |
| `--name` | The diagram space name |
| `--diagram` | The starter diagram identifier |
| `--description` | A description for the project |
| `--open-editor` | Open the created project in a coding editor |
| `--editor` | Choose the editor launch command |
| `--yes` | Skip the interactive naming prompt |

The initializer creates instructions, examples, catalog references, and a starter diagram. Follow the printed next steps rather than assuming the starter filename from its display title.

## Open Studio

```bash
npx create-dumb-diagrams@latest studio diagrams
npx create-dumb-diagrams@latest studio diagrams/payments.dgm --no-open
```

`open` is an alias for `studio`. The optional path defaults to `diagrams/architecture.dgm`.

| Flag | Default | Purpose |
| --- | --- | --- |
| `--port` | `4788` | Port for the local server |
| `--host` | `127.0.0.1` | Bind address; use a non-loopback address only for a trusted network |
| `--no-open` | Off | Do not open the browser automatically |

See [Using Studio](../studio/) before changing the host binding.

## Validate source

```bash
npx create-dumb-diagrams@latest validate diagrams
npx create-dumb-diagrams@latest check diagrams/payments.dgm
```

`validate` and `check` are aliases. Pass a file or directory. The command parses, validates, compiles, and reports routing notes. Invalid source returns a failing exit code; a structurally valid diagram can still have layout or routing warnings worth reviewing.

## Format a file

```bash
npx create-dumb-diagrams@latest format diagrams/payments.dgm
npx create-dumb-diagrams@latest fmt diagrams/payments.dgm --write
```

Without `--write`, canonical source is printed to the terminal. With it, the file is updated. `fmt` is an alias.

## Render a file

```bash
npx create-dumb-diagrams@latest render diagrams/payments.dgm --output payments.svg
```

The output is portable SVG. The default destination is `output.svg`. Other formats are available through [Studio exports](../exports/).

## Contributor fixtures

`fixtures` renders the built-in `async-docs` or `transfer-hub` development fixture. It is intended for repository development and may need workspace examples and catalog inputs. Use `render` for your own `.dgm` files.
