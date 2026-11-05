# Architecture brief

## Goal
Left-to-right Google Cloud (`gcp`) diagram of a small customer-record API.

## Explicit requirements
- External web client sends HTTPS requests through Cloud Load Balancing to a Cloud Run API.
- Cloud Run reads and writes customer records in Cloud SQL.
- Organization contains a project, which contains the primary region; the three services are in the region.
- Client is outside the organization. No other services. Automatic routing.

## Relationships and containment
- client -> load balancer (HTTPS) -> Cloud Run API -> Cloud SQL (read/write, bidirectional).
- organization > project > region > {load balancer, Cloud Run, Cloud SQL}.

## Inferred decisions and exclusions
- Read/write is drawn as one bidirectional edge.
- No VPC, IAM, logging, monitoring or other services.
