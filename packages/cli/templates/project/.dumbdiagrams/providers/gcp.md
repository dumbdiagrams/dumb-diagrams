# GCP conventions (Experimental)

GCP support is experimental. Until refined, inherit the current AWS layout,
routing, and composition conventions in this project while using GCP catalog
types and their GCP icons.

Use canonical `gcp.*` types from `../catalog.md` or `../catalog.json` and obey
each entry's allowed parent boundaries. Use the GCP cloud/project/region or
network boundaries only when explicit, strongly implied, or necessary to show
placement. Use `cloud-agnostic.boundary` for logical application groupings.

Preserve explicitly named GCP services and public/private or runtime
placement. Do not translate a request into AWS services or add unrequested
best-practice services. Resolve GCP architecture semantics first, then use the
common layout, routing, and composition rules in `../dgm.md`.

Draw managed services (Cloud Storage, BigQuery, Pub/Sub, Cloud Logging, Cloud
Monitoring, IAM, Secret Manager) outside the VPC network; validation warns with
`managed-service-in-network` when one is inside it.
