# Architecture brief

## Goal

Show a provider-neutral order processing system with a primary region, asynchronous fulfillment, and a recovery region that can serve buyers from a replicated database.

## Explicit requirements

- Use cloud-agnostic grammar with one cloud, one account, and primary and recovery regions.
- Place the primary load balancer before the API server; the API server is inside a private application network and cluster.
- Show API use of the primary database and cache, its call to an external payment service, and enqueueing to a regional queue outside the network.
- Put the worker in the application cluster; show queue consumption, explicit retry to the queue, fulfillment request and warehouse acknowledgment, status persistence, and receipt storage.
- Keep object storage outside the primary network.
- Replicate the primary database to a recovery database in a recovery network; the recovery application server reads the replica and is reachable through a recovery load balancer.
- Keep payment and warehouse external; use automatic layout and routing.

## Relationships and containment

- Buyer -> primary load balancer -> primary API.
- API -> primary database, primary cache, payment service, and primary queue. Database, cache, and payment response arrows return to the API.
- Queue -> worker; worker -> queue is the explicit retry loop.
- Worker -> warehouse and warehouse -> worker carry fulfillment and acknowledgment; worker writes order status to primary database and receipts to object storage.
- Primary database -> recovery database replicates data; recovery application server -> recovery database reads replica data.
- Buyer -> recovery load balancer -> recovery application server is the recovery serving path.
- Both regions sit within one cloud account. Primary application server components, database, and cache are inside the primary private network; recovery database and recovery application are inside the recovery network. Regional load balancers and queue, plus object storage, remain outside those private networks.

## Inferred decisions and exclusions

- The API and fulfillment worker share one application cluster in the primary network.
- Recovery load balancing is modeled as a separate serving path without adding automatic failover control components.
- No provider-specific services or unrelated infrastructure are introduced.
