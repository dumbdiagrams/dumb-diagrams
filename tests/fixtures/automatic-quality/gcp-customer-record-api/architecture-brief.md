# Architecture brief

## Goal
A left-to-right Google Cloud customer-record API with an external web client, Cloud Load Balancing, a Cloud Run API, and Cloud SQL.

## Explicit requirements
- One external web client sends HTTPS requests through Cloud Load Balancing to the Cloud Run API.
- The API reads and writes customer records in Cloud SQL.
- Nest a project and primary region inside a Google Cloud organization; place all three GCP services in the region.
- Keep the client outside the organization; add no other services; use automatic routing.

## Relationships and containment
The request path is client → load balancer → API → database. The organization contains the project, which contains the primary region and its three services. The client remains outside the organization.

## Inferred decisions and exclusions
No additional component or service is inferred. The arrows represent HTTPS forwarding and API database reads/writes without splitting the bidirectional data access into separate arrows.
