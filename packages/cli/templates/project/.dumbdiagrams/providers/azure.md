# Azure conventions (Experimental)

Azure support is experimental. Until refined, inherit the current AWS layout,
routing, and composition conventions in this project while using Azure catalog
types and their Azure icons.

Use canonical `azure.*` types from `../catalog.md` or `../catalog.json` and obey
each entry's allowed parent boundaries. Use the Azure cloud/account/region or
network boundaries only when explicit, strongly implied, or necessary to show
placement. Use `cloud-agnostic.boundary` for logical application groupings.

Preserve explicitly named Azure services and public/private or runtime
placement. Do not translate a request into AWS services or add unrequested
best-practice services. Resolve Azure architecture semantics first, then use
the common layout, routing, and composition rules in `../dgm.md`.

Draw managed PaaS services (Storage accounts, Cosmos DB, Key Vault, Front Door,
DNS zones, Service Bus, Event Grid, Monitor) outside the VNet; validation warns
with `managed-service-in-network` when one is inside it.
