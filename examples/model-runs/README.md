# Model runs

Prompt-only golden sets: each run gives the 16 reviewed prompts
(`examples/reviewed/v0.1.0/*.prompt.md`) to one model in a fresh
`dumbdiagrams init` workspace, one agent per prompt, with no bundled examples to
copy. Folders are named `<model>-<YYYY-MM-DD>`, and bundles
`<provider>-<difficulty>-v0.1.0-<slug>`.

Sources, briefs, and requirements contracts are kept byte-for-byte as the model
wrote them. The repository tests check that every source parses, validates, and
satisfies its own contract, so a new run exercises the same deterministic checks.
`diagram.svg` is rendered by the engine named in the run's `manifest.json`, which
also records each bundle's strict-validation result at generation time.

To add a run, copy each `diagrams/<slug>/` bundle from the workspace with its
`user-prompt.md`, render `diagram.svg`, and write the manifest.
