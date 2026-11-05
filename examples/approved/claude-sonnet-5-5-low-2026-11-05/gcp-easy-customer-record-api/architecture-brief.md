# Architecture brief

## Goal

Left-to-right GCP customer-record API: client, Cloud Load Balancing, Cloud Run, Cloud SQL. Provider/grammar: `gcp`.

## Explicit requirements

- External web client sends HTTPS through Cloud Load Balancing to a Cloud Run API, which reads and writes Cloud SQL. Project and region inside organization; client outside.
- No other services beyond those named.

## Relationships and containment

- `client` → `lb`: HTTPS.
- `lb` → `api`: Route.
- `api` → `db`: Read/write records.

- `client` (Web client) at root, outside any boundary.
- `org` (Google Cloud organization) at root, outside any boundary.
- `project` (Project) inside `org`.
- `region` (Primary region) inside `project`.
- `lb` (Load balancer) inside `region`.
- `api` (Customer API) inside `region`.
- `db` (Customer records) inside `region`.

## Inferred decisions and exclusions

- None; the request fully determined the structure.
- Automatic layout, left-to-right; no manual coordinates.
