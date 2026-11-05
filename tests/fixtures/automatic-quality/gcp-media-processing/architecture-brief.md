# Architecture brief

## Goal
A GCP media-processing system with external upload and operations clients, a regional ingest and notification path, two subnet-separated Compute Engine workers, object storage, job/status persistence, and Pub/Sub job, completion, and dead-letter topics.

## Explicit requirements
- External media producer → Cloud Load Balancing → regional Cloud Run ingest. Ingest writes input objects to Cloud Storage and publishes jobs to a global Pub/Sub jobs topic.
- Two Compute Engine workers in separate regional subnets of one VPC consume jobs. Each worker reads inputs, writes processed objects, updates Cloud SQL job status, and publishes completion to a global Pub/Sub topic.
- Cloud Run notification delivers completion to an external operations client.
- Jobs dead-letter to a second Pub/Sub topic. The operations client inspects dead letters and deliberately redrives them to the jobs topic.
- Show organization and project; global services are at project scope and regional services are in their region. Subnets are network subdivisions, not availability zones.

## Relationships and containment
Each worker has its own job-consumption edge and its own input-read, processed-write, status-update, and completion-publication edges. The jobs topic also dead-letters to a separate Pub/Sub topic. The operations client is connected to the dead-letter topic for inspection and to the jobs topic to represent an initiated redrive. The organization contains the project; regional services and one VPC are in a region; the VPC contains two distinct regional subnets, each containing one worker. Global Cloud Storage and Pub/Sub resources sit at project scope.

## Inferred decisions and exclusions
Input objects and processed objects use distinct Cloud Storage resources to make the two named object roles visible. The dead-letter redrive is shown as an operations-client initiated relation to the jobs topic; the prompt does not specify a particular redrive mechanism or an additional service, so none is added. The separate subnet placement does not imply separate availability zones.
