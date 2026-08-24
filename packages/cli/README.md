# dumbdiagrams

Local, source-first diagram Studio for agent-generated `.dgm` files.

```bash
npx dumbdiagrams@latest init my-diagrams --open-editor
cd my-diagrams
npx dumbdiagrams@latest studio architecture.dgm
```

The initializer creates the diagram source and the local instructions that
coding agents should read before editing it. It also copies the built-in
example diagrams into `examples/` so an agent can inspect the source style.
Studio watches the project source file and saves validated changes back to disk.

Use `--editor cursor` or `--editor code` to select a specific editor command.
Without `--editor`, `--open-editor` tries Cursor, VS Code, Codium, Windsurf,
and Zed in that order. The flag is opt-in so scripted initialization remains
headless-friendly.
