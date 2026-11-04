# Hard provider review candidates

These four reference bundles were rendered with Dumb Diagrams v0.1.0. They preserve automatic layout and contain routing findings, so they remain outside the reviewed gallery and accepted routing baselines.

| Provider | Scenario | Prompt | Reference source |
| --- | --- | --- | --- |
| AWS | Parallel document workers, shared storage, and DLQ redrive | [Prompt](aws-hard-document-processing/user-prompt.md) | [Source](aws-hard-document-processing/diagram.dgm) |
| Azure | Private endpoints, asynchronous orders, telemetry, and redrive | [Prompt](azure-hard-private-order-processing/user-prompt.md) | [Source](azure-hard-private-order-processing/diagram.dgm) |
| Google Cloud | Parallel media workers, completion events, and dead letters | [Prompt](gcp-hard-media-processing/user-prompt.md) | [Source](gcp-hard-media-processing/diagram.dgm) |
| Cloud-agnostic | Payment and warehouse responses, retries, and regional recovery | [Prompt](cloud-agnostic-hard-regional-orders/user-prompt.md) | [Source](cloud-agnostic-hard-regional-orders/diagram.dgm) |

Give a fresh project the prompt, then compare its output with `reference-spec.md`. Run `dumbdiagrams validate --strict <diagram.dgm>` and inspect it in Studio. Record the app version, model, source, exported SVG, and diagnostics for each run. Check arrow meanings and containment before judging route quality.

Review crossings, shared corridors, labels, icon overlaps, and retry/return paths. Preserve the architecture when fixing layout; promote a candidate only after its visual review.
