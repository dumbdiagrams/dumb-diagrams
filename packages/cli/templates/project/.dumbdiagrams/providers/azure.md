# Azure conventions (Experimental)

Azure support is experimental. Azure diagrams follow the AWS layout, routing,
and composition conventions; only the catalog types and icons are Azure's own.

Use canonical `azure.*` types from `../catalog.md` or `../catalog.json` and obey
each entry's allowed parent boundaries. Azure has no cloud boundary: show the
Azure scope as `azure.subscription` containing `azure.region`, and add
`azure.resource-group`, `azure.vnet`, or `azure.subnet` only when explicit,
strongly implied, or necessary to show placement. Never use
`cloud-agnostic.cloud`; validation rejects it with `generic-cloud-boundary`. Use
`cloud-agnostic.boundary` for logical application groupings.

Preserve explicitly named Azure services and public/private or runtime
placement. Do not translate a request into AWS services or add unrequested
best-practice services. Resolve Azure architecture semantics first, then use
the common layout, routing, and composition rules in `../dgm.md`.

Draw managed PaaS services (Storage accounts, Cosmos DB, Key Vault, Front Door,
DNS zones, Service Bus, Event Grid, Monitor) outside the VNet; validation warns
with `managed-service-in-network` when one is inside it.
