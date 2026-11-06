# Architecture brief

## Goal

Left-to-right GCP webhook pipeline from partner through load balancing, Cloud Functions, Pub/Sub, Dataflow to BigQuery and Cloud Storage. Provider/grammar: `gcp`.

## Explicit requirements

- Partner webhooks via Cloud Load Balancing to Cloud Functions ingress; publishes to Pub/Sub; Dataflow writes records to BigQuery and raw files to Cloud Storage.
- No other services beyond those named.

## Relationships and containment

- `partner` → `lb`: Webhook events.
- `lb` → `ingress`: Route.
- `ingress` → `topic`: Publish.
- `topic` → `dataflow`: Events.
- `dataflow` → `bq`: Processed records.
- `dataflow` → `raw`: Raw files.

- `partner` (Partner) at root, outside any boundary.
- `org` (Google Cloud organization) at root, outside any boundary.
- `project` (Project) inside `org`.
- `region` (Primary region) inside `project`.
- `lb` (Load balancer) inside `region`.
- `ingress` (Ingress handler) inside `region`.
- `topic` (Event topic) inside `region`.
- `dataflow` (Event processing) inside `region`.
- `bq` (Processed records) inside `region`.
- `raw` (Raw event files) inside `region`.

## Inferred decisions and exclusions

- None; the request fully determined the structure.
- Automatic layout, left-to-right; no manual coordinates.
