# Architecture brief

## Intent and explicit requirements

- Provider: Google Cloud.
- Workload: a small HTTP API that reads and writes customer records.
- Keep the diagram to the public request path and its primary data store.

## Normalized components

- An external web client.
- A Google Cloud organization containing one project and one region.
- Cloud Load Balancing as the public entry point.
- Cloud Run as the API service.
- Cloud SQL as the relational data store.

## Directed relationships

- Web client → Cloud Load Balancing → Cloud Run → Cloud SQL.

## Placement, constraints, and exclusions

- Keep all Google Cloud groups nested in the order organization, project,
  region. Place the three services in the region.
- Keep the client outside the organization.
- Do not add networking, identity, monitoring, queues, or other services.
- Use a readable left-to-right automatic layout; do not specify coordinates or
  routes.
