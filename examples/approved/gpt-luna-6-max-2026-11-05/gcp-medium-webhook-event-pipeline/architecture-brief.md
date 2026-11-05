# Architecture brief

## Goal

Provider: GCP. An external partner sends webhook events through Cloud Load Balancing to Cloud Functions. Pub/Sub feeds Dataflow, which writes processed records to BigQuery and raw event files to Cloud Storage.

## Explicit requirements

- External partner sends webhook events through Cloud Load Balancing to Cloud Functions ingress handler.
- Ingress publishes to Pub/Sub; Pub/Sub sends events to Dataflow.
- Dataflow writes processed records to BigQuery and raw event files to Cloud Storage.
- Nest event-processing project and primary region in organization; all services in region; no other services; automatic routing.

## Relationships and containment

- Organization contains the event-processing project and primary region.
- Partner is outside the organization; all GCP services are inside the primary region.
- Partner → load balancer → ingress → Pub/Sub → Dataflow → BigQuery and Cloud Storage.

## Inferred decisions and exclusions

- Cloud Load Balancing and Pub/Sub are placed in the region to honor the instruction that all services are in the region.
- No other services are included.
