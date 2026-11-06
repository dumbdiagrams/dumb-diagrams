Draw a left-to-right Google Cloud document-processing architecture. A partner
uploads documents through a Cloud Run intake service, which stores original
files in a Cloud Storage source bucket. Object notifications from the source
bucket publish to Pub/Sub; a second Cloud Run service consumes those events,
reads the original file, stores normalized output in a separate Cloud Storage
bucket, and writes processing status and metadata to Cloud SQL. Nest the
project and primary region inside a Google Cloud organization, with all Google
Cloud services in the region. Keep the partner outside the organization. Add
no other services and use automatic routing.
