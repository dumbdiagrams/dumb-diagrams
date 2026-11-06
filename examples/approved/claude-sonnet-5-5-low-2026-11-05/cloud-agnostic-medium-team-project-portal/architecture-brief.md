# Architecture brief

## Goal

Provider-neutral portal: load balancer, portal server with database and cache in a private network, attachments in object storage outside it. Provider/grammar: `cloud-agnostic`.

## Explicit requirements

- Users reach a load balancer to a portal server; server reads database, uses cache, retrieves attachments from object storage. Server, database, cache in private network; load balancer and object storage outside.
- No other services beyond those named.

## Relationships and containment

- `users` → `lb`: Requests.
- `lb` → `portal`: Forward.
- `portal` → `db`: Project data.
- `portal` → `cache`: Frequent lookups.
- `portal` → `attachments`: Fetch attachments.

- `users` (Users) at root, outside any boundary.
- `cloud` (Application cloud) at root, outside any boundary.
- `lb` (Load balancer) inside `cloud`.
- `network` (Private network) inside `cloud`.
- `portal` (Portal server) inside `network`.
- `cache` (Cache) inside `network`.
- `db` (Project database) inside `network`.
- `attachments` (Attachment storage) inside `cloud`.

## Inferred decisions and exclusions

- Users are a client actor outside the cloud.
- A cloud boundary is required as the parent of the private network.
- Automatic layout, left-to-right; no manual coordinates.
