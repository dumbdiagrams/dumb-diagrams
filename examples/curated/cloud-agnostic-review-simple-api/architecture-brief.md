# Architecture brief

## Intent and explicit requirements

- Provider: cloud agnostic.
- Workload: a small HTTP API that reads and writes customer records.
- Keep the diagram to the request path and primary data store.

## Normalized components

- An external web client.
- An application cloud with one production account and primary region.
- An API gateway, API service, and relational database.

## Directed relationships

- Web client → API gateway → API service → customer database.

## Placement, constraints, and exclusions

- The account and region are nested inside the application cloud.
- Place the gateway, API service, and database in the region.
- Keep the client outside the cloud.
- Do not add provider-specific services or extra infrastructure.
- Use automatic left-to-right layout with no fixed positions or routes.
