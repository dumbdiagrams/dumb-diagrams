# Examples

- `prompts/` holds the prompt bank: one plain-language request per case, named
  `<provider>-<difficulty>-<slug>.md`. Give these to a model in a fresh
  `dumbdiagrams init` workspace, one agent per prompt.
- `model-runs/<model>-<YYYY-MM-DD>/` holds a run awaiting review, one bundle
  per prompt with the same name. Create it when adding a run.
- `approved/<model>-<YYYY-MM-DD>/` holds reviewed runs. Studio's example
  picker, the website, and the engine baselines use these diagrams.

A bundle keeps the model's `diagram.dgm`, `architecture-brief.md`, and
`requirements.json` byte-for-byte, plus its `user-prompt.md` and a rendered
`diagram.svg`. The run's `manifest.json` records the model, date, CLI tarball
hashes, and each bundle's strict-validation result at generation time.

The repository tests check that every source parses, validates, and satisfies
its own requirements contract, so a new run exercises the same deterministic
checks. Approving a run means moving its folder from `model-runs/` to
`approved/`.
