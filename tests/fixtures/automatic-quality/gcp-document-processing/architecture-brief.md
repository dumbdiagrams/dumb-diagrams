# Architecture brief

## Goal
A left-to-right Google Cloud document-processing pipeline for partner uploads, with original and normalized object storage plus processing status metadata.

## Explicit requirements
- A partner uploads through one Cloud Run intake service, which stores originals in a source Cloud Storage bucket.
- Source bucket object notifications publish to Pub/Sub; a second Cloud Run service consumes events, reads the original, writes normalized output to a separate Cloud Storage bucket, and writes status and metadata to Cloud SQL.
- The organization contains the project and primary region, and every GCP service is in the region. Keep the partner outside; add no other services; use automatic routing.

## Relationships and containment
The flow is partner → intake → source bucket → Pub/Sub → processor. The processor also reads the original from the source bucket and writes to the normalized bucket and Cloud SQL. The project and region are nested under the organization.

## Inferred decisions and exclusions
The two Cloud Storage buckets are represented as separate resources because the prompt names a source bucket and a separate output bucket. Object notification publication and event consumption are represented as distinct directed edges.
