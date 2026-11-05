# Architecture brief

## Goal
Left-to-right Google Cloud (`gcp` grammar) document-processing pipeline.

## Explicit requirements
- Partner uploads via Cloud Run intake service; originals go to a Cloud Storage source bucket.
- Source bucket notifications publish to Pub/Sub; a second Cloud Run service consumes them.
- Processor reads the original, writes normalized output to a separate Cloud Storage bucket, and writes status/metadata to Cloud SQL.
- Project and region nested in a Google Cloud organization; all services in the region; partner outside the organization.
- No other services; automatic routing.

## Relationships and containment
partner -> intake -> source bucket -> Pub/Sub -> processor; processor reads source bucket, writes normalized bucket and Cloud SQL. organization > project > region > services.

## Inferred decisions and exclusions
- Partner is a cloud-agnostic actor. No support services, VPC, or manual layout added.
