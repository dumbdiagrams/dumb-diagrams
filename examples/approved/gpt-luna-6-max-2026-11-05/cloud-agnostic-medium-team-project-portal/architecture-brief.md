# Architecture brief

## Goal

Show users reaching a team project portal through a load balancer, with the portal server using private project data and cache plus regional object storage for attachments.

## Explicit requirements

- Users reach a load balancer that forwards requests to a portal server.
- The server reads project data from a database, uses a cache for frequent lookups, and retrieves attachments from object storage.
- Keep the server, database, and cache in a private network; keep the load balancer and object storage outside it.
- Use a left-to-right automatic layout and add no other services.

## Relationships and containment

- Users reach the load balancer, which forwards to the portal server; the server accesses the database, cache, and object storage.
- The private network contains the server, database, and cache; load balancer and attachment storage remain outside the network.

## Inferred decisions and exclusions

- An application cloud wrapper is used as the required parent context for the private-network boundary; no provider-specific product is implied.
- The user actor is modeled as a client resource outside the application cloud.
