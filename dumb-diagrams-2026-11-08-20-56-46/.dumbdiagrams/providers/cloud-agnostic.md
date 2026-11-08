# Cloud-agnostic conventions (Experimental)

Cloud-agnostic support is experimental. Cloud-agnostic diagrams follow the AWS
layout, routing, and composition conventions; only the catalog types and icons
are generic.

Use canonical `cloud-agnostic.*` types from `../catalog.md` or
`../catalog.json`. Use generic cloud, account, region, network, or other
boundaries only when explicit, strongly implied, or needed to show placement.
Use cloud-agnostic actor and logical-boundary types for provider-neutral
components. Do not use AWS, Azure, or GCP service types in a cloud-agnostic
diagram.

Preserve provider-neutral names and relationships. Do not invent a provider or
translate a request into a specific cloud. Resolve the architecture first,
then use the common layout, routing, and composition rules in `../dgm.md`.

Draw DNS, object storage, and identity outside a network boundary; validation
warns with `managed-service-in-network` when one is inside it.
