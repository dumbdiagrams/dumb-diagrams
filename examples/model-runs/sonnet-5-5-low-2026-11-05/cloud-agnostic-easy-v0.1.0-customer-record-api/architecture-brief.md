# Architecture brief

## Goal
Provider-neutral (`cloud-agnostic`) left-to-right diagram of a small customer-record API.

## Explicit requirements
- External web client sends HTTPS requests to an API gateway.
- Gateway calls the customer API service.
- Service reads and writes a customer database.
- Application cloud contains a production account, which contains the primary region; the gateway, service, and database sit in the region.
- Client is outside the cloud. No provider-specific products or other infrastructure. Automatic routing.

## Relationships and containment
- client -> gateway (HTTPS), gateway -> api (Route), api <-> database (Read/write, bidirectional).
- cloud > account > region > {gateway, api, database}; client at root.

## Inferred decisions and exclusions
- Read/write modeled as one bidirectional edge.
- No responses, monitoring, identity, or network boundaries added.
