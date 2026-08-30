# Cloud-agnostic conventions (Experimental)

Cloud-agnostic support is experimental. Until refined, inherit the current AWS
layout, routing, and composition conventions in this project while using
cloud-agnostic catalog types and their icons.

Use canonical `cloud-agnostic.*` types from `../catalog.md` or
`../catalog.json`. Use generic cloud, account, region, network, or other
boundaries only when explicit, strongly implied, or needed to show placement.
Use cloud-agnostic actor and logical-boundary types for provider-neutral
components. Do not use AWS, Azure, or GCP service types in a cloud-agnostic
diagram.

Preserve provider-neutral names and relationships. Do not invent a provider or
translate a request into a specific cloud. Resolve the architecture first,
then use the common layout, routing, and composition rules in `../dgm.md`.
