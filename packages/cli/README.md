# dumbdiagrams

Local, source-first diagram Studio for agent-generated `.dgm` files.

Requires Node.js 24 or newer.

```bash
npx dumbdiagrams@latest init --open-editor
# Prompts for a project name and opens it in your editor.
# Run the printed `Next:` command to open its diagrams folder in Studio.
```

When no directory or name is supplied in an interactive terminal, `init` asks
what the project should be called. The answer becomes the display name and a
safe kebab-case folder name. For scripted use, choose the values explicitly or
use `--yes` for a timestamped fallback:

```bash
dumbdiagrams init --name "Payments Platform" --diagram system-overview
dumbdiagrams init --directory ./projects/payments --name "Payments Platform"
dumbdiagrams init --name payments --description "Event-driven billing system."
dumbdiagrams init --yes
```

The initializer creates a starter source in `diagrams/` and local instructions
that coding agents should read before editing it. Each new diagram should be a
new `.dgm` file in that folder; Studio can select among the project files. It
also copies the built-in example diagrams and their matching prompts into
`examples/` so an agent can inspect both the requested structure and the
resulting source. Studio watches the selected project file and saves validated
changes back to disk.

It also creates `CATALOG.md` and `CATALOG.json`. Agents should search those
files for canonical resource/group types before adding service icons; a quoted
label changes display text but does not select an icon.

Use `--editor cursor` or `--editor code` to select a specific editor command.
Without `--editor`, `--open-editor` tries Cursor, VS Code, Codium, Windsurf,
and Zed in that order. The flag is opt-in so scripted initialization remains
headless-friendly.
