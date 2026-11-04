# Reference specification

## Entities

- External partner: `partner` (`cloud-agnostic.client`, label `Document
  partner`).
- `organization` (`gcp.organization`, label `Google Cloud organization`).
- `project` (`gcp.project`, label `Document processing project`).
- `region` (`gcp.region`, label `Primary region`).
- `intake` (`gcp.cloud-run`, label `Document intake (Cloud Run)`).
- `source` (`gcp.cloud-storage`, label `Original documents bucket`).
- `events` (`gcp.pub-sub`, label `Document events topic`).
- `processor` (`gcp.cloud-run`, label `Document processor (Cloud Run)`).
- `normalized` (`gcp.cloud-storage`, label `Normalized documents bucket`).
- `metadata` (`gcp.cloud-sql`, label `Processing status and metadata`).

## Containment

- `partner` is outside Google Cloud.
- `organization` contains `project`; `project` contains `region`.
- `region` contains `intake`, `source`, `events`, `processor`, `normalized`,
  and `metadata`.

## Edges

- `partner` → `intake`, id `upload_documents`, label `Document uploads`,
  step 1, flow.
- `intake` → `source`, id `store_original`, label `Store original`, step 2,
  flow.
- `source` → `events`, id `publish_object_event`, label `Object notification`,
  step 3, flow.
- `events` → `processor`, id `consume_document_event`, label `Consume event`,
  step 4, flow.
- `source` → `processor`, id `read_original`, label `Read original`, flow.
- `processor` → `normalized`, id `write_normalized`, label `Store normalized`,
  step 5, flow.
- `processor` → `metadata`, id `write_processing_metadata`,
  label `Write status and metadata`, step 6, flow.

The processor branches to the normalized output bucket and Cloud SQL after
consuming each source object event. No other entities or edges are required.
