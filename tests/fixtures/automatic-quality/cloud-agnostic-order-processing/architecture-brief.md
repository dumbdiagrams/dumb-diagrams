# Architecture brief

## Goal
Cloud-neutral order processing with primary and recovery regions, synchronous order dependencies, queued fulfillment, and database replication.

## Explicit requirements
- One account with primary and recovery regions. Primary buyer traffic reaches the regional load balancer and API server.
- API is in the primary private application network and application cluster. Primary database and cache share the network; regional queue is outside it.
- API calls database, cache, and external payment service, with a separate response arrow from each. API enqueues work.
- Queue feeds a worker in the application cluster. Worker sends fulfillment to external warehouse and receives its acknowledgment, retries by re-enqueuing, writes order status to primary database, and writes receipts to object storage outside the network.
- Primary database replicates to a recovery database in a recovery network. Recovery application server reads it and serves the buyer through a recovery load balancer.
- Payment and warehouse are external; preserve all directions and containment.

## Relationships and containment
Every call, return, queue transfer, retry, status write, receipt write, replication, recovery read, and recovery serving leg is a distinct directed edge. Account contains both regions. Primary region contains primary network, regional queue, receipt storage, and primary load balancer; primary network contains the application cluster, primary database, and cache. Cluster contains API and worker. Recovery region contains recovery network and recovery load balancer; recovery network contains recovery database and recovery application server. Buyer, payment, and warehouse are external to the account.

## Inferred decisions and exclusions
Because no separate recovery cluster is named, the recovery application server is placed directly in the recovery network. Generic servers represent API, worker, payment, and warehouse endpoints. Load balancer response behavior is represented as recovery server → recovery load balancer → buyer. No extra infrastructure is added.
