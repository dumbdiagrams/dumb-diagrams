# Architecture brief

## Goal

Provider-neutral customer-record API: client, API gateway, API service, database in a production account and primary region. Provider/grammar: `cloud-agnostic`.

## Explicit requirements

- External web client sends HTTPS through an API gateway to a customer API service, which reads and writes a customer database. Production account and primary region in an application cloud; client outside.
- No other services beyond those named.

## Relationships and containment

- `client` → `gateway`: HTTPS.
- `gateway` → `api`: Route.
- `api` → `db`: Read/write records.

- `client` (Web client) at root, outside any boundary.
- `cloud` (Application cloud) at root, outside any boundary.
- `account` (Production account) inside `cloud`.
- `region` (Primary region) inside `account`.
- `gateway` (API gateway) inside `region`.
- `api` (Customer API) inside `region`.
- `db` (Customer database) inside `region`.

## Inferred decisions and exclusions

- None; the request fully determined the structure.
- Automatic layout, left-to-right; no manual coordinates.
