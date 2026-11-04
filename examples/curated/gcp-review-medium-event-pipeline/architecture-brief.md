# Architecture brief

## Intent and explicit requirements

- Provider: Google Cloud.
- Workload: ingest webhook events, process them asynchronously, and retain
  both queryable results and a raw archive.
- Show the main event path and its two output branches.

## Normalized components

- An external partner sending events.
- A Google Cloud organization and an event-processing project.
- Cloud Load Balancing and Cloud Functions for ingress.
- Pub/Sub as the asynchronous buffer.
- Dataflow as the event processor.
- BigQuery for processed records and Cloud Storage for raw event files.

## Directed relationships

- Partner → Cloud Load Balancing → ingress function → Pub/Sub → processor.
- Pub/Sub feeds Dataflow, which writes processed records to BigQuery and raw
  event files to Cloud Storage.

## Placement, constraints, and exclusions

- Keep the partner outside the organization. Nest the project and primary
  region inside the organization.
- Place all six services in the primary region.
- Do not add networking, IAM, monitoring, or other services.
- Use automatic left-to-right layout with no fixed node positions or routes.
