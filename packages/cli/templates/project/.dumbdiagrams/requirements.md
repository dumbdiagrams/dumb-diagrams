# Architecture requirements

Write `requirements.json` beside `diagram.dgm` before authoring. For a custom
flat file, use `<stem>.requirements.json`. Use `requirements.example.json` and
`requirements.schema.json` as references.
For `diagrams/<name>/requirements.json`, the optional `$schema` path is
`../../.dumbdiagrams/requirements.schema.json`.

## Extract, then check

1. Select the grammar and look up canonical catalog types.
2. List required resources and groups with stable IDs. Expand repeated roles
   such as "both workers" into separate entries.
3. Give every required relationship its own edge ID, source, and target.
4. Record explicit counts and placement. Preserve separate response arrows.
5. Check the extraction against the user's prompt, then write `.dgm` using
   those IDs. Do not derive requirements from an already simplified diagram.

Every entry has `basis: { "kind": "explicit", "text": "short prompt excerpt" }`
or `basis: { "kind": "inferred", "text": "brief rationale" }`. Do not copy
secrets, unrelated conversation, or hidden reasoning.

## Contract fields

| Field | Meaning |
| --- | --- |
| `version` | `1` |
| `grammar` | `aws`, `azure`, `gcp`, or `cloud-agnostic` |
| `components` | `{id, kind, type?, basis}`; `kind` is `resource` or `group`; resource types are required |
| `relationships` | `{id, source, target, kind?, basis}`; `id` is the `.dgm` edge ID; optional `kind` constrains connector meaning |
| `counts` | `{id, kind, type, min?, max?, within?, basis}`; at least one bound; `within` names an ancestor group |
| `placement` | `{id, component, relation, group?, basis}`; `relation` is `inside`, `parent`, `outside`, or `root` |
| `allowAdditionalResources` | Defaults to `true`; use `false` for an explicit "no other services" requirement |
| `preferences` | Optional `{numberedSteps?, edgeLabels?, resourceLabels?}`; record it only when the user explicitly overrides the project-root `preferences.json` for this diagram. With `numberedSteps: true`, put sequence numbers in native edge `step N` fields and keep labels descriptive only. |
| `generatedBy` | Optional `{model, reasoning?}`: your model name and selected reasoning or thinking level, exactly as known. Omit unknown values; never guess. Debugging only |

All four lists are required; lists other than `components` may be empty.
IDs must be unique within each list. Resources and groups share a component
namespace; edge IDs use a separate namespace, matching `.dgm`. Relationship endpoints must
name listed resources; placement groups and count scopes must name listed groups.
`inside` and `outside` inspect the full ancestor chain; `parent` requires the
immediate parent. `root` forbids a parent and omits `group`. Other placement
relations require `group`. Equal minimum and maximum values express exact counts.
Labels and coordinates are not requirements. Relationship endpoints stay ordered,
including peer and bidirectional connectors; omitted connector kind allows any kind.

## Validate

```bash
dumbdiagrams validate diagrams/example/diagram.dgm
dumbdiagrams validate --strict diagrams/example/diagram.dgm
dumbdiagrams validate --json diagrams/example/diagram.dgm
```

Normal validation requires the companion contract and checks source/provider
validity, completeness, and the project preferences (with any per-diagram
override from the contract). Routing findings are reported separately;
`--strict` also fails on them. Use `--requirements <path>` for a custom contract or stdin.

Keep the contract unchanged during layout repairs. Correct genuine extraction
mistakes in the contract and explain them in the brief. Never omit a required
edge, replace several relationships with a broad label, or weaken requirements
to clear routing warnings. After two unsuccessful layout repairs, preserve the
complete graph and report the remaining findings.

The checker proves agreement with this contract. It cannot prove that the model
extracted every requirement from the original natural-language prompt.
