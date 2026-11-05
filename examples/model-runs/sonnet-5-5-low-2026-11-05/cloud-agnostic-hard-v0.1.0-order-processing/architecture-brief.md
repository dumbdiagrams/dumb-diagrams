# Architecture brief

## Goal
Provider: cloud-agnostic. Order processing in one cloud account with primary and recovery regions.

## Explicit requirements
- Public buyer, regional load balancer in the primary region, API server in the primary private network and cluster.
- Database and cache in the primary network; queue and object storage in the region, outside the network.
- External payment service and external warehouse stay outside the cloud.
- Worker server in the application cluster.
- Recovery region: recovery network with recovery database replica and recovery app server; recovery load balancer serves the buyer.

## Relationships and containment
- buyer -> primary LB -> API; API <-> database, cache, payment (separate responses); API -> queue.
- Queue -> worker; worker <-> warehouse; worker retries to queue; worker -> database and object storage.
- Primary database -> recovery database; recovery app reads replica; buyer -> recovery LB -> recovery app.

## Inferred decisions and exclusions
- Cloud > account > regions wrap the resources; buyer, payment and warehouse sit at root.
- The recovery load balancer sits in the recovery region outside the network.
- No extra services added.
