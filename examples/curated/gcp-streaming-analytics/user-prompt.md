Create a left-to-right Google Cloud streaming analytics diagram. Put clients
outside a Google Cloud organization, then nest a project, region, and VPC.
Inside the VPC, group Cloud Load Balancing and Cloud Functions as ingress and
compute, Pub/Sub and Dataflow as the streaming pipeline, and IAM, Secret
Manager, Cloud Monitoring, and Cloud Logging as governance and operations.
Keep BigQuery and Cloud Storage in the region. Show the numbered ingestion,
processing, warehouse, and archive path. Keep operational services visible as a
separate grouped concern; use dashed operational relationships only when they
can be routed without crossing the primary path.
