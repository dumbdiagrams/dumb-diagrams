# {{projectName}}

{{descriptionBlock}}A local Dumb Diagrams project. Authored `.dgm` files live in `diagrams/`,
one diagram per file. Shared agent knowledge and read-only examples live under
`.dumbdiagrams/`.

## Structure

- `diagrams/{{diagramFile}}` — starter diagram only
- `diagrams/<name>.dgm` — one new file per additional diagram
- `diagrams/README.md` — output-folder file policy
- `AGENTS.md` — universal router to the canonical instructions
- `CLAUDE.md` / `GEMINI.md` — tiny compatibility entrypoints
- `.dumbdiagrams/instructions.md` — canonical workflow and navigation
- `.dumbdiagrams/architecture.md` — prompt interpretation and architecture brief contract
- `.dumbdiagrams/dgm.md` — source and layout conventions
- `.dumbdiagrams/providers/` — provider-specific conventions
- `.dumbdiagrams/examples/` — curated four-role examples and remaining legacy references
- `.dumbdiagrams/catalog.md` / `catalog.json` — canonical resource and group types

Open the visual editor with:

```bash
npx create-dumb-diagrams@latest studio diagrams
```

Describe the architecture naturally. The coding agent should discover
`AGENTS.md`, follow the shared instructions selectively, create a new file under
`diagrams/`, validate it, and inspect the rendered result. For a revision, name
the exact existing `.dgm` file.
