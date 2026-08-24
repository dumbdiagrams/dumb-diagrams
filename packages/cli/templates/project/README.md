# {{projectName}}

{{descriptionBlock}}A local Dumb Diagrams project. Authored `.dgm` files live in `diagrams/`,
one diagram per file. The `examples/` directory contains matching source
and prompt references for coding agents.

## Structure

- `diagrams/{{diagramFile}}` — starter diagram only
- `diagrams/<name>.dgm` — one new file per additional diagram
- `diagrams/README.md` — output-folder file policy
- `DUMB_DIAGRAMS.md` — required instructions and source conventions
- `examples/*.dgm` — reference diagram source files
- `examples/prompts/*.md` — prompts that produced the reference diagrams
- `CATALOG.md` / `CATALOG.json` — canonical resource and group icon types

Open the visual editor with:

```bash
npx dumbdiagrams@latest studio diagrams
```

Ask your coding agent to read `DUMB_DIAGRAMS.md` and `diagrams/README.md`
completely. For a new request, ask it to create a new file under `diagrams/`;
for a revision, name the exact existing `.dgm` file. When adding services,
search `CATALOG.md` for the canonical type before writing the source.
