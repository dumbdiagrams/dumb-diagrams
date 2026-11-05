# Architecture brief

## Goal

Provider-neutral order processing with recovery region.

## Explicit requirements

- Create a cloud-neutral order processing architecture in one cloud account with primary and recovery regions. A public buyer reaches a regional load balancer, which forwards requests to an API server inside the primary private application network and cluster. The database and cache are in the same private network. The API uses them, calls an external payment service, and enqueues work in a regional queue outside the network. Show separate database, cache, and payment response arrows back to the API. The queue feeds a worker server in the application cluster. The worker sends fulfillment to an external warehouse and receives its acknowledgment back; it retries by sending work back to the queue. It also writes order status to the primary database and receipts to object storage outside the network. The primary database replicates to a recovery database inside a recovery network. A recovery application server reads that replica and can serve the buyer through a recovery load balancer. Keep payment and warehouse external, and preserve all directions and containment.

## Relationships and containment

- Preserve the directed interactions and containment specified in the prompt.

- Recovery serving path is explicit from the recovery application server through the recovery load balancer to the buyer; the initial draft omitted this response direction and has been corrected.

## Inferred decisions and exclusions

- Primary and recovery regions share one account. Payment and warehouse stay external. No provider-specific products or extra services are introduced.
