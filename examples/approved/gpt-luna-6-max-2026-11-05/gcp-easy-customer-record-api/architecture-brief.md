# Architecture brief

## Goal

Provider: GCP. A small customer-record API accepts external HTTPS requests through Cloud Load Balancing, serves them with Cloud Run, and reads and writes records in Cloud SQL.

## Explicit requirements

- Show the external web client and three named Google Cloud services.
- Nest a project and primary region within a Google Cloud organization.
- Keep the client outside the organization; use left-to-right automatic routing; add no other services.

## Relationships and containment

- The client sends HTTPS requests through Cloud Load Balancing to Cloud Run.
- Cloud Run reads and writes customer records in Cloud SQL.
- The project and region are nested in the organization; all GCP services are inside the region.

## Inferred decisions and exclusions

- The Cloud Run to Cloud SQL edge represents the requested read/write interaction in one directed connector.
- No other services are included.
