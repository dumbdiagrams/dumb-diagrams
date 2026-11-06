# Architecture brief

## Goal

Left-to-right GCP document pipeline: Cloud Run intake, source bucket, Pub/Sub notifications, Cloud Run processor, output bucket, Cloud SQL. Provider/grammar: `gcp`.

## Explicit requirements

- Partner uploads via Cloud Run intake to source bucket; notifications publish to Pub/Sub; second Cloud Run reads the original, stores normalized output in a separate bucket, writes status to Cloud SQL.
- No other services beyond those named.

## Relationships and containment

- `partner` → `intake`: Upload.
- `intake` → `source`: Store original.
- `source` → `events`: Object notifications.
- `events` → `processor`: Events.
- `source` → `processor`: Read original.
- `processor` → `output`: Normalized output.
- `processor` → `db`: Status and metadata.

- `partner` (Partner) at root, outside any boundary.
- `org` (Google Cloud organization) at root, outside any boundary.
- `project` (Project) inside `org`.
- `region` (Primary region) inside `project`.
- `intake` (Intake service) inside `region`.
- `source` (Source bucket) inside `region`.
- `events` (Object events) inside `region`.
- `processor` (Processing service) inside `region`.
- `output` (Normalized bucket) inside `region`.
- `db` (Status and metadata) inside `region`.

## Inferred decisions and exclusions

- None; the request fully determined the structure.
- Automatic layout, left-to-right; no manual coordinates.
