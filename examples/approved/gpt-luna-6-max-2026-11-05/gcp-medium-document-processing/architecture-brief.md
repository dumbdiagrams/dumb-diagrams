# Architecture brief

## Goal

Provider: GCP. A partner uploads documents through a Cloud Run intake service. A source bucket notification drives a second Cloud Run service to normalize the original, store output, and record status and metadata.

## Explicit requirements

- Partner uploads documents through Cloud Run intake.
- Intake stores original files in Cloud Storage source bucket.
- Source bucket object notifications publish to Pub/Sub.
- A second Cloud Run service consumes events, reads original files, stores normalized output in separate Cloud Storage bucket, and writes processing status and metadata to Cloud SQL.
- Nest project and primary region in organization; keep all GCP services in region; partner outside; no other services; automatic left-to-right routing.

## Relationships and containment

- Organization contains the document-processing project and primary region.
- All GCP services are inside the primary region; partner is outside organization.
- Partner → intake → source bucket → Pub/Sub → processor. Processor reads source bucket and writes output bucket and Cloud SQL.

## Inferred decisions and exclusions

- The requested Pub/Sub topic is placed in the primary region because the prompt explicitly places all Google Cloud services there.
- No additional services are included.
