# Architecture brief

## Goal
Provider-neutral (`cloud-agnostic`) team project portal, left-to-right automatic layout.

## Explicit requirements
- Users reach a load balancer, which forwards to a portal server.
- The server reads from a database, uses a cache, and retrieves attachments from object storage.
- Server, database, and cache are in a private network; load balancer and object storage are outside it.
- No other services.

## Relationships and containment
- users -> load balancer -> server; server -> database, cache, object storage.
- Network contains server, database, cache. Load balancer and object storage are at root.

## Inferred decisions and exclusions
- Users are drawn as an actor (not a service).
- No response edges, DNS, identity, monitoring, or other services added.
- A cloud boundary is added because the network group requires a cloud parent; users sit outside it.
