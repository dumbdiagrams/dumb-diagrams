# Architecture brief

## Goal
Left-to-right Google Cloud (`gcp` grammar) webhook event pipeline: a partner's webhooks are ingested, published, processed, and stored.

## Explicit requirements
- Partner sends webhook events through Cloud Load Balancing to a Cloud Functions ingress handler.
- The handler publishes to a Pub/Sub topic; Pub/Sub sends events to Dataflow.
- Dataflow writes processed records to BigQuery and raw event files to Cloud Storage.
- Automatic routing; no other services.

## Relationships and containment
- Partner is outside the Google Cloud organization.
- Organization contains the event-processing project, which contains the primary region; all services are in the region.

## Inferred decisions and exclusions
- Partner is a `cloud-agnostic.client`.
- No VPC, monitoring, IAM, or other services added.
