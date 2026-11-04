# Reference specification

## Entities

- External partner: `partner` (`cloud-agnostic.client`, label `Webhook partner`).
- `organization` (`gcp.organization`, label `Google Cloud organization`).
- `project` (`gcp.project`, label `Event processing project`).
- `region` (`gcp.region`, label `Primary region`).
- `load_balancer` (`gcp.cloud-load-balancing`, label `Cloud Load Balancing`).
- `ingress` (`gcp.cloud-functions`, label `Webhook ingress function`).
- `processor` (`gcp.dataflow`, label `Dataflow event processor`).
- `events` (`gcp.pub-sub`, label `Pub/Sub event topic`).
- `warehouse` (`gcp.bigquery`, label `BigQuery event tables`).
- `archive` (`gcp.cloud-storage`, label `Cloud Storage raw archive`).

## Containment

- `partner` is outside Google Cloud.
- `organization` contains `project`; `project` contains `region`.
- `region` contains `load_balancer`, `ingress`, `processor`, `events`,
  `warehouse`, and `archive`.

## Edges

- `partner` → `load_balancer`, id `webhook_requests`, label `Webhook events`,
  step 1, flow.
- `load_balancer` → `ingress`, id `deliver_webhook`, step 2, flow.
- `ingress` → `events`, id `publish_events`, label `Publish events`, step 3,
  flow.
- `events` → `processor`, id `consume_events`, label `Consume events`, step 4,
  flow.
- `processor` → `warehouse`, id `processed_records`, label `Processed records`,
  step 5, flow.
- `processor` → `archive`, id `raw_events`, label `Raw event files`, step 6,
  flow.

Dataflow branches to BigQuery and Cloud Storage for processed records and raw
event files. No other entities or edges are required.
