# Architecture brief: cloud-agnostic webhook processing

## Goal
Provider-neutral (`cloud-agnostic`) left-to-right webhook-processing flow.

## Explicit requirements
- External partner, API gateway, ingress function, queue, event processor, event database, payload archive (object storage).
- Application cloud > production account > primary region > private network.
- Webhook-edge boundary: gateway + ingress function. Event-processing boundary in the network: queue, processor, database.
- Payload archive in the region, outside the private network. No other services; automatic routing.

## Relationships and containment
- partner -> gateway -> ingress -> queue -> processor -> archive.
- ingress -> database (idempotency key); processor -> database (processed status).
- Webhook-edge sits in the private network; event-processing sits in the private network.

## Inferred decisions and exclusions
- Webhook-edge placed inside the private network (the prompt places only the archive outside it).
- No additional services, support resources, or manual layout.
