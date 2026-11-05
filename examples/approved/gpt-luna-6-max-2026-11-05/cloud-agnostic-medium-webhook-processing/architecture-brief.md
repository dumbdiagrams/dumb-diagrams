# Architecture brief

## Goal

Show a provider-neutral webhook pipeline with an external partner, a webhook edge, private event processing, and a regional payload archive.

## Explicit requirements

- An external partner sends webhook events to an API gateway and webhook ingress function.
- The ingress queues events and writes an idempotency key to an event database.
- An event processor consumes the queue, stores processed status in the same database, and archives the payload in object storage.
- Nest a production account, primary region, and private network inside an application cloud.
- Place the gateway and ingress function in a webhook-edge boundary; place the queue, processor, and database in an event-processing boundary within the network.
- Keep the payload archive in the region outside the private network.
- Add no other services and use automatic routing.

## Relationships and containment

- Partner events flow through the gateway to ingress; ingress fans out to the work queue and idempotency record.
- The queue feeds the processor; the processor updates the same event database and archives payloads.
- The cloud contains the production account and primary region. The event-processing boundary is inside the private network; payload archive is in the region outside it.

## Inferred decisions and exclusions

- The webhook-edge boundary and object storage are placed directly in the primary region, outside the private network, to keep the ingress edge and archive distinct from private event processing. The prompt does not further qualify edge placement.
- No services beyond the named gateway, function, queue, processor, database, and object storage are included.
