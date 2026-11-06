# Examples

- `prompts/` holds the prompt bank: one plain-language request per case, named
  `<provider>-<difficulty>-<slug>.md`. Give these to a model in a fresh
  `dumbdiagrams init` workspace, one agent per prompt. Each prompt has a
  reviewed `<id>.reference.json` that `pnpm score:run` checks runs against.
- `approved/<model>-<reasoning>-<YYYY-MM-DD>/` holds reviewed one-shot runs of
  the whole bank. Every approved run is frozen by layout contracts, SVG
  snapshots, routing reviews, and the performance budget. The run whose
  `manifest.json` says `"featured": true` feeds Studio's example picker and the
  website hero; the docs gallery lets readers switch between runs.

A bundle keeps the model's `diagram.dgm`, `architecture-brief.md`, and
`requirements.json` byte-for-byte, plus its `user-prompt.md` and a rendered
`diagram.svg`. The run's `manifest.json` records the model, reasoning, date,
and each bundle's strict-validation result.

## Evaluating a new model

1. Run every prompt in a fresh `dumbdiagrams init` project, one agent each.
2. `pnpm score:run <project>` validates each bundle and checks it against the
   prompt's reference contract. Nothing is written.
3. To add the run to the golden set:
   `pnpm approve:run <project> --model <name> --reasoning <level> [--featured] --decision "<why the routing warnings are acceptable>"`.
   This copies the run into `approved/` and regenerates the SVGs, routing
   reviews, layout contracts, engine snapshots, and performance budget for
   every approved run. Delete a run's folder to retire it.
4. Review `git diff`, then run `pnpm test` and `pnpm check:website`.
