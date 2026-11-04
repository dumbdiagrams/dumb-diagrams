# Architecture brief

## Goal

- Provider: Google Cloud.
- Workload: accept partner documents, process them asynchronously, and store
  normalized files plus processing metadata.
- Show the upload path, storage event handoff, and processor output branches.

## Explicit requirements

- An external partner uploads documents through a Cloud Run intake service.
- The intake service stores originals in a Cloud Storage source bucket.
- Source bucket object notifications publish to Pub/Sub.
- A second Cloud Run service consumes events and reads the original object.
- The processor writes normalized output to a separate Cloud Storage bucket
  and status/metadata to Cloud SQL.
- Keep the partner outside Google Cloud. Add no other services and use
  automatic routing.

## Relationships and containment

- Partner → intake service → source bucket.
- Source bucket → Pub/Sub → processor.
- Processor reads the original from the source bucket and writes normalized
  output to the destination bucket and processing status/metadata to Cloud SQL.
- Nest a project and primary region inside the Google Cloud organization;
  place both Cloud Run services, both Cloud Storage buckets, Pub/Sub, and Cloud
  SQL in the region.

## Inferred decisions and exclusions

- Treat the object notification as the source bucket's event publication to
  Pub/Sub; the processor then receives those events from the topic.
- Use separate source and destination buckets to preserve originals and keep
  normalized output distinct.
- Do not add networking, IAM, monitoring, or other services.
- Use a left-to-right automatic layout without fixed positions or routes.
