# Examples

- `prompts/` holds the prompt bank: one plain-language request per case, named
  `<provider>-<difficulty>-<slug>.md`. Give these to a model in a fresh
  `dumbdiagrams init` workspace, one agent per prompt. Each prompt has a
  reviewed `<id>.reference.json` that `pnpm score:run` checks runs against.
- `approved/<model>-<YYYY-MM-DD>/` holds the one reviewed run. Studio's example
  picker, the website, and the engine baselines use these diagrams.

A bundle keeps the model's `diagram.dgm`, `architecture-brief.md`, and
`requirements.json` byte-for-byte, plus its `user-prompt.md` and a rendered
`diagram.svg`. The run's `manifest.json` records the model, reasoning, date,
and each bundle's strict-validation result.

## Evaluating a new model

1. Run every prompt in a fresh `dumbdiagrams init` project, one agent each.
2. `pnpm score:run <project>` validates each bundle and checks it against the
   prompt's reference contract. Nothing is written.
3. To make the run the golden set:
   `pnpm approve:run <project> --model <name> --reasoning <level> --decision "<why the routing warnings are acceptable>"`.
   This replaces `approved/`, re-renders the SVGs, rewrites the routing
   reviews, layout contracts, engine snapshots, and performance budget.
4. Review `git diff`, then run `pnpm test` and `pnpm check:website`.
