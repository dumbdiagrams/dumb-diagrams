# Architecture brief

## Intent and explicit requirements

- Provider: cloud agnostic.
- Workload: accept partner webhooks, queue them for processing, and store both
  an idempotency record and the processed payload.
- Show the request path, asynchronous handoff, and the two persistence writes.

## Normalized components

- An external webhook partner.
- An application cloud with a production account, primary region, and private
  network.
- An API gateway and ingress function in an edge boundary.
- A queue, processing function, and relational database in an application
  boundary, plus regional object storage outside the private network.

## Directed relationships

- Partner → gateway → ingress function.
- Ingress function → queue and database (idempotency record).
- Queue → processing function.
- Processing function → database (processed status) and object storage
  (payload archive).

## Placement, constraints, and exclusions

- Keep partner external to the cloud. Nest account, region, and private network
  inside the cloud.
- Put gateway and ingress function together in the edge boundary inside the
  private network. Put queue, processor, and database in the application
  boundary inside the network. Place object storage in the region outside the
  private network.
- Do not add a firewall, monitoring, authentication, or provider-specific
  services.
- Use automatic left-to-right layout; do not set node positions or routes.
