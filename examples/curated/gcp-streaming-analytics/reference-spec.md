Create a diagram titled "Google Cloud streaming analytics platform" using the
GCP grammar and automatic left-to-right layout. Use canonical GCP catalog types
only. Preserve organization → project → region containment and place one VPC
inside the region. The VPC contains three meaningful boundaries: ingress and
compute (Cloud Load Balancing, Cloud Functions), streaming pipeline (Pub/Sub,
Dataflow), and governance and operations (IAM, Secret Manager, Cloud Monitoring,
Cloud Logging). BigQuery and Cloud Storage are regional resources outside the
VPC.

Connect clients → Load Balancing → Functions → Pub/Sub → Dataflow, then route
Dataflow to BigQuery and Cloud Storage. Keep operational services grouped beside
the pipeline; add dashed peer relationships only when they do not collide with
the primary data path. Do not use manual positions/routes or invent a unique
icon for a product with only shared category artwork.
