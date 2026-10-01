Create a diagram titled "Google Cloud streaming analytics platform" using the
GCP grammar and automatic left-to-right layout. Use canonical GCP catalog types
only. Preserve organization → project → region containment and place one VPC
inside the region. The VPC contains the ingress and compute boundary (Cloud
Load Balancing, Cloud Functions, Compute Engine, GKE) and the streaming
pipeline boundary with Dataflow. Keep Pub/Sub at project scope outside the
region; its topics and subscriptions use a global namespace. Place governance
and operations (IAM, Secret Manager, Cloud Monitoring, Cloud Logging) in a
project-level boundary outside the region. BigQuery and Cloud Storage are
regional resources outside the VPC.

Connect clients → Load Balancing → Functions → Pub/Sub → Dataflow, then route
Dataflow to BigQuery and Cloud Storage. Keep operational services grouped beside
the pipeline; add dashed peer relationships only when they do not collide with
the primary data path. Do not use manual positions/routes or invent a unique
icon for a product with only shared category artwork.
