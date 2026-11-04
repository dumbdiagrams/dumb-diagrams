# Architecture brief

## Goal

Show a provider-neutral team portal with a load-balanced application server and separate data services.

## Explicit requirements

- Users enter through a load balancer.
- The portal server reads project data from a database, uses a cache for frequent lookups, and retrieves attachments from object storage.
- The server, database, and cache are in a private network. The load balancer and object storage are outside it.

## Relationships and containment

- The load balancer routes user requests to the portal server.
- The database, cache, and object storage provide data to the server.
- The server, database, and cache are inside the private network. The load balancer and object storage are in the region but outside the network.

## Inferred decisions and exclusions

- Use one cloud, account, and region to show scope without naming a provider.
- Exclude identity, DNS, monitoring, and vendor-specific services.
- Use left-to-right automatic layout.
