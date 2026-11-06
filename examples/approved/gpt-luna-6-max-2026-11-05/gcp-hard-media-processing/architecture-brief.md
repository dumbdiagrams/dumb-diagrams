# Architecture brief

## Goal

Provider: GCP. External uploads enter through Cloud Load Balancing and regional Cloud Run ingest. Ingest stores input and publishes global jobs. Two workers in separate regional subnets process objects, update Cloud SQL, and publish completion. Global topics also support dead-letter inspection and redrive.

## Explicit requirements

- External media producer uploads through Cloud Load Balancing to regional Cloud Run ingest.
- Ingest writes input object to Cloud Storage and publishes to global Pub/Sub jobs topic.
- Two Compute Engine workers in separate regional subnets of one VPC consume jobs. Each reads input objects, writes processed objects, updates Cloud SQL job status, and publishes completion to global Pub/Sub completion topic.
- Cloud Run notification service delivers completion to external operations client.
- Jobs dead-letter to a second Pub/Sub topic; operations client inspects dead letters and redrives them to jobs topic.
- Show organization/project; global services at project scope and regional services in region; subnets are not AZs.

## Relationships and containment

- Organization contains the project, which contains the primary region.
- Regional resources: Cloud Run ingest, Cloud Storage buckets, one VPC with two regional subnets and one worker per subnet, Cloud SQL, and Cloud Run notification service.
- Project-scope global Pub/Sub topics: jobs, completion, and dead-letter. Load balancing is placed at project scope.
- Both external actors remain outside organization.

## Inferred decisions and exclusions

- Cloud Load Balancing is placed at project scope to represent its global scope; the prompt does not specify regional load balancing.
- Cloud Storage buckets and Cloud SQL are placed in the primary region as regional data services.
- The operations client inspects the dead-letter topic and triggers redrive to the jobs topic; the dead-letter topic supplies the messages back through a dashed/peer connector.
