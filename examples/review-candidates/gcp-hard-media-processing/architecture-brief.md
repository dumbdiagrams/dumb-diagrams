# Architecture brief

## Goal

Show a GCP media-processing pipeline from an external producer through global ingress and messaging, regional processing and persistence, and completion notification to an external operations client.

## Explicit requirements

- Use GCP grammar with organization and project groups.
- Keep Cloud Load Balancing, Pub/Sub topics, and Cloud Storage buckets at project scope.
- Show regional Cloud Run and Cloud SQL services.
- Place two Compute Engine workers in distinct subnets in the primary region, both under one global VPC; subnet labels identify the region, not zones.
- Preserve object reads/writes, job status updates, completion publishing, dead-letter delivery, dead-letter inspection, and deliberate operator redrive.
- Use fully automatic layout and routing.

## Relationships and containment

- Producer -> load balancer -> ingest service; ingest writes input storage and publishes jobs.
- Jobs topic fans out to both workers; each worker reads input storage, writes processed storage and SQL status, and publishes completion.
- Completion topic -> notification service -> operations client.
- Jobs topic -> dead-letter topic; operations client inspects dead letters and explicitly redrives to jobs.
- GCP resources are under the project. Regional services are under the primary region; workers are in separate subnet groups labeled for that region under the project-scoped VPC.

## Inferred decisions and exclusions

- The two workers share one Cloud SQL instance, input bucket, processed bucket, jobs topic, and completion topic.
- Dead-lettering is represented as a topic-level connection; no separate subscription resource is introduced.
- No unrelated storage, networking, monitoring, or security services are added.
