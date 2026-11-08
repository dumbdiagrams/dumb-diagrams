# GCP conventions (Experimental)

GCP support is experimental. GCP diagrams follow the AWS layout, routing,
and composition conventions; only the catalog types and icons are GCP's own.

Use canonical `gcp.*` types from `../catalog.md` or `../catalog.json` and obey
each entry's allowed parent boundaries. Show the GCP scope as
`gcp.organization` containing `gcp.project`, and add region, VPC network, zone,
or subnet boundaries only when explicit, strongly implied, or necessary to show
placement. Never use `cloud-agnostic.cloud`; validation rejects it. Use `cloud-agnostic.boundary` for logical application groupings.

Preserve explicitly named GCP services and public/private or runtime
placement. Do not translate a request into AWS services or add unrequested
best-practice services. Resolve GCP architecture semantics first, then use the
common layout, routing, and composition rules in `../dgm.md`.

Draw managed services (Cloud Storage, BigQuery, Pub/Sub, Cloud Logging, Cloud
Monitoring, IAM, Secret Manager) outside the VPC network; validation warns with
`managed-service-in-network` when one is inside it.
