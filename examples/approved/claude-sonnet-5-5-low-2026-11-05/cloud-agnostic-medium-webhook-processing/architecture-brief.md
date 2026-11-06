# Architecture brief

## Goal

Provider-neutral webhook processing with edge and event-processing boundaries in an application cloud. Provider/grammar: `cloud-agnostic`.

## Explicit requirements

- Partner sends webhooks to API gateway and ingress function, which queues events and writes idempotency key to event database; processor consumes queue, stores status in same database, archives payload in object storage. Boundaries as described.
- No other services beyond those named.

## Relationships and containment

- `partner` → `gateway`: Webhook events.
- `gateway` → `ingress`: Invoke.
- `ingress` → `queue`: Queue events.
- `ingress` → `db`: Idempotency key.
- `queue` → `processor`: Consume.
- `processor` → `db`: Processed status.
- `processor` → `archive`: Archive payload.

- `partner` (External partner) at root, outside any boundary.
- `cloud` (Application cloud) at root, outside any boundary.
- `account` (Production account) inside `cloud`.
- `region` (Primary region) inside `account`.
- `edge` (Webhook edge) inside `region`.
- `gateway` (API gateway) inside `edge`.
- `ingress` (Ingress function) inside `edge`.
- `network` (Private network) inside `region`.
- `processing` (Event processing) inside `network`.
- `queue` (Event queue) inside `processing`.
- `processor` (Event processor) inside `processing`.
- `db` (Event database) inside `processing`.
- `archive` (Payload archive) inside `region`.

## Inferred decisions and exclusions

- The webhook-edge boundary sits in the region outside the private network; only event processing is stated to be in the network.
- Automatic layout, left-to-right; no manual coordinates.
