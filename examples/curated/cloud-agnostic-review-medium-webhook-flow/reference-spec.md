# Reference specification

## Entities

- External partner: `partner` (`cloud-agnostic.client`, label `Webhook partner`).
- `cloud` (`cloud-agnostic.cloud`, label `Application cloud`).
- `account` (`cloud-agnostic.account`, label `Production account`).
- `region` (`cloud-agnostic.region`, label `Primary region`).
- `network` (`cloud-agnostic.network`, label `Private network`).
- `edge` (`cloud-agnostic.boundary`, label `Webhook edge`).
- `gateway` (`cloud-agnostic.gateway`, label `API gateway`).
- `ingress` (`cloud-agnostic.function`, label `Webhook ingress function`).
- `processing` (`cloud-agnostic.boundary`, label `Event processing`).
- `queue` (`cloud-agnostic.queue`, label `Event queue`).
- `worker` (`cloud-agnostic.function`, label `Event processor`).
- `database` (`cloud-agnostic.database`, label `Event database`).
- `archive` (`cloud-agnostic.object-storage`, label `Payload archive`).

## Containment

- `partner` is outside the cloud.
- `cloud` contains `account`; `account` contains `region`; `region` contains
  `network`.
- `network` contains `edge` and `processing`.
- `edge` contains `gateway` and `ingress`.
- `processing` contains `queue`, `worker`, and `database`.
- `region` contains `archive` outside `network`.

## Edges

- `partner` → `gateway`, id `webhook_requests`, label `Webhook events`, step 1,
  flow.
- `gateway` → `ingress`, id `deliver_webhook`, step 2, flow.
- `ingress` → `queue`, id `enqueue_events`, label `Queue events`, step 3, flow.
- `ingress` → `database`, id `idempotency_record`, label `Record event key`,
  step 4, flow.
- `queue` → `worker`, id `consume_events`, label `Consume events`, step 5,
  flow.
- `worker` → `database`, id `processed_record`, label `Store processed status`,
  step 6, flow.
- `worker` → `archive`, id `save_payload`, label `Archive payload`, step 7,
  flow.

Ingress branches to queue and the idempotency write. Queue processing later
writes the processed status and payload archive. No other entities or edges
are required.
