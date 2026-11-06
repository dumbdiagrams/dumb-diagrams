# Architecture brief

## Goal
Provider-neutral team project portal with user traffic through a load balancer to a portal server and its data services.

## Explicit requirements
- Users reach a load balancer, which forwards requests to a portal server.
- The server reads project data from a database, uses a cache for frequent lookups, and retrieves attachments from object storage.
- Server, database, and cache are in a private network. Load balancer and object storage are outside it.
- Left-to-right automatic layout; no other services.

## Relationships and containment
Users → load balancer → portal server. Portal server → database, cache, and object storage. Private network contains the server, database, and cache. The load balancer and attachment storage are outside the network but remain in the primary region. The primary region is nested in an account and application cloud.

## Inferred decisions and exclusions
Users are represented as a generic actor. Cloud, account, and primary-region boundaries provide the required parent scopes for the private network and regional resources. Read/write and response directions were not separately specified; the requested server-to-resource uses are shown once each. No additional services are inferred.
