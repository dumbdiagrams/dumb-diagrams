# Architecture brief

## Goal
GCP (experimental grammar `gcp`) media processing pipeline, left-to-right.

## Explicit requirements
- External media producer -> Cloud Load Balancing -> regional Cloud Run ingest.
- Ingest writes input object to Cloud Storage and publishes to global Pub/Sub jobs topic.
- Two Compute Engine workers in separate regional subnets of one VPC consume jobs, read input, write processed objects, update Cloud SQL, publish to global completion topic.
- Cloud Run notification service delivers completion to external operations client.
- Jobs dead-letter to a second Pub/Sub topic; operations client inspects and redrives to jobs topic.
- Organization/project shown; global services at project scope; regional services in their region; subnets are not zones.

## Relationships and containment
- Organization > project. Load balancer and three Pub/Sub topics sit at project scope.
- Regional services group (ingest, notification, Cloud Storage, Cloud SQL) in a region.
- One VPC at project scope containing two regions, each with one subnet and one worker.
- Producer and operations client are outside the organization.

## Inferred decisions and exclusions
- Cloud Storage and Cloud SQL placed in the services region (regional resources).
- Read and write to storage are separate edges.
- No zones, monitoring, IAM, or other extras.
