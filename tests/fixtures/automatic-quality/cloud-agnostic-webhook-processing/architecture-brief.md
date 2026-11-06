# Architecture brief

## Goal
Provider-neutral webhook processing: partner events enter through a gateway and ingress function, are queued and processed, persisted, and archived.

## Explicit requirements
- External partner → API gateway → webhook ingress function.
- Ingress queues events and writes an idempotency key to the event database.
- Event processor consumes the queue, writes processed status to that same database, and archives payloads in object storage.
- Application cloud contains production account and primary region; private network is within that region.
- Gateway and ingress share a webhook-edge boundary. Queue, processor, and database share an event-processing boundary inside the private network. Payload archive is in the region outside the private network.
- No other services; automatic routing.

## Relationships and containment
All seven requested directed interactions are represented independently. Cloud → account → region; region contains the network, webhook-edge boundary, and payload archive. Network contains event-processing boundary and its queue, processor, and database. The partner is external to the cloud.

## Inferred decisions and exclusions
The webhook-edge boundary is placed in the region outside the private network because only the event-processing boundary is explicitly said to be within the network. The processor is represented as a generic function. No acknowledgment arrows or additional infrastructure are inferred.
