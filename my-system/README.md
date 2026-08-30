# My System

A repository prepared for Dumb Diagrams. Authored `.dgm` files are portable and
can live wherever your workflow needs them. Shared agent knowledge and examples live under
`.dumbdiagrams/`.

## Structure

- `AGENTS.md` — universal router to the canonical instructions
- `CLAUDE.md` / `GEMINI.md` — tiny compatibility entrypoints
- `.dumbdiagrams/instructions.md` — canonical workflow and navigation
- `.dumbdiagrams/architecture.md` — prompt interpretation and architecture brief contract
- `.dumbdiagrams/dgm.md` — source and layout conventions
- `.dumbdiagrams/providers/` — provider-specific conventions
- `.dumbdiagrams/examples/` — curated examples
- `.dumbdiagrams/catalog.md` / `catalog.json` — canonical resource and group types

Start the generic visual editor with:

```bash
dumbdiagrams studio
```

Describe the architecture naturally. The coding agent should read `AGENTS.md`
and the shared instructions, create or update a `.dgm` file, and then open that
exact file in Studio for review.
