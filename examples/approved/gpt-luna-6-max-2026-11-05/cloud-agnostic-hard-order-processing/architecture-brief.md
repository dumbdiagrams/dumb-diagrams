# Architecture brief

## Goal

Show cloud-neutral primary and recovery order-processing paths in one account, preserving private application containment, synchronous response arrows, asynchronous fulfillment, and database replication.

## Explicit requirements

- One cloud account contains primary and recovery regions.
- A buyer reaches the primary regional load balancer, which forwards requests to an API server inside the primary private application network and cluster.
- The primary database and cache are in the same private network; the API uses them, calls an external payment service, and enqueues work in a regional queue outside the network.
- Show separate database, cache, and payment response arrows back to the API.
- The queue feeds a worker server in the application cluster. The worker sends fulfillment to an external warehouse, receives its acknowledgment, and retries work by sending it back to the queue.
- The worker writes order status to the primary database and receipts to object storage outside the network.
- The primary database replicates to a recovery database inside a recovery network.
- A recovery application server reads that replica and can serve the buyer through a recovery load balancer.
- Keep payment and warehouse external and preserve all directions and containment.

## Relationships and containment

- The primary request path is buyer → primary load balancer → API. The API has distinct request and response connectors for database, cache, and external payment, then enqueues processing. The database response is a dashed directed return so the later worker status update does not reorder the synchronous API sequence.
- The queue feeds the primary worker. Fulfillment and acknowledgment use separate arrows; retries return from worker to queue. The worker updates the primary database and writes receipts to regional object storage.
- The primary database replicates to the recovery database. The recovery application reads the replica and has a buyer request/response route through the recovery load balancer.
- Both regions are inside one account and one application cloud; primary and recovery networks are region-scoped. Primary API and worker share the application cluster.

## Inferred decisions and exclusions

- The named object storage is placed in the primary region outside the primary private network.
- The recovery serving path includes the return arrows from recovery application to recovery load balancer and load balancer to buyer because the request says the recovery application can serve the buyer through that load balancer.
- Retry is modeled as an explicit failure connector and remains unnumbered as required by project preferences.
