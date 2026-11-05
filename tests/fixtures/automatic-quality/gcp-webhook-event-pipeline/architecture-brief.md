# Architecture brief

## Goal
A left-to-right Google Cloud webhook event pipeline that ingests partner webhooks, processes events, stores processed records in BigQuery, and archives raw event files in Cloud Storage.

## Explicit requirements
- A partner sends webhook events through Cloud Load Balancing to a Cloud Functions ingress handler.
- The handler publishes to Pub/Sub; Pub/Sub sends events to Dataflow.
- Dataflow writes processed records to BigQuery and raw event files to Cloud Storage.
- Nest the event-processing project and primary region in the organization; place all services in the region. Keep the partner outside; add no other services; use automatic routing.

## Relationships and containment
The event path is partner → load balancer → ingress → Pub/Sub → Dataflow. Dataflow has two output edges, one to BigQuery and one to Cloud Storage. The project and region are nested under the organization.

## Inferred decisions and exclusions
No additional component or service is inferred. The prompt treats the raw-file archive as a Cloud Storage destination for raw event files; no distinct bucket or additional processing stage is specified.
