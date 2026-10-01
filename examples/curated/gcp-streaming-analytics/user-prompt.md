Create a left-to-right Google Cloud streaming analytics diagram. Put clients
outside a Google Cloud organization, then nest a project and region with one
VPC. Keep Cloud Load Balancing, Cloud Functions, Compute Engine, GKE, and
Dataflow in the VPC, with Dataflow in the streaming pipeline boundary. Place
Pub/Sub at project scope outside the region; its topics and subscriptions use a
global namespace. Place IAM, Secret Manager, Cloud
Monitoring, and Cloud Logging in a project-level governance and operations
boundary outside the region. Keep BigQuery and Cloud Storage in the region.
Show the numbered ingestion, processing, warehouse, and archive path. Keep
operational services visible as a separate grouped concern; use dashed
operational relationships only when they can be routed without crossing the
primary path.
