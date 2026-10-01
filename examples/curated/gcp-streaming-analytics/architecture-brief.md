# Architecture brief

This Google Cloud example represents a regional streaming analytics platform.
Load Balancing accepts producer and analyst traffic, Cloud Functions publishes
to Pub/Sub, and Dataflow transforms events into BigQuery while archiving raw
events in Cloud Storage.

Organization, project, and region scopes make deployment boundaries explicit;
the VPC contains the ingress and compute workloads plus Dataflow workers in the
streaming pipeline boundary. Pub/Sub is shown at project scope outside the
region; its topics and subscriptions use a global namespace. IAM, Secret
Manager, Cloud Monitoring, and Cloud Logging are project-level governance and
operations peers outside the region. The main data path remains solid and
numbered; operational annotations may use dashed relationships when they can
be rendered without obscuring that path.
