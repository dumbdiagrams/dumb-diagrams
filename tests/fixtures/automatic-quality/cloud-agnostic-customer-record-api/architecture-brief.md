# Architecture brief

## Goal
Provider-neutral, left-to-right customer-record API with an external web client, gateway, API service, and database.

## Explicit requirements
- One application cloud containing a production account and primary region.
- External web client sends HTTPS requests through an API gateway to the customer API service.
- Customer API reads and writes the customer database.
- Gateway, API service, and database are in the primary region; client is outside the cloud.
- No provider-specific products or additional infrastructure; automatic routing.

## Relationships and containment
Client → gateway → customer API; API → database for separate read and write operations. Cloud → account → region; the three services are in the region.

## Inferred decisions and exclusions
The generic API service is represented by a cloud-agnostic container. No response arrow was requested. No other infrastructure is inferred.
