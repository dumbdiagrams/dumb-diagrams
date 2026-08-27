Create a diagram titled "Write-through caching with Azure Managed Redis and Azure SQL Database" using the AWS grammar's deterministic automatic layout conventions with canonical Azure catalog resources and a left-to-right flow. Do not add a `view` block, manual node positions, manual edge routes, or decorative resources that are not part of the architecture.

Architecture and containment:
- Put a cloud-agnostic client application outside an Azure subscription on the far left.
- Inside an `azure.subscription`, create one Azure region labelled "Azure region".
- Inside the region, add an iconless dashed blue `cloud-agnostic.boundary` labelled "Write-through caching architecture" to keep the VNet, its private endpoints, the regional PaaS services, and Monitor as one readable composition.
- Inside that architecture boundary, create one `azure.vnet` labelled "Azure virtual network". The VNet is the private networking boundary and must contain the application tier and exactly two private endpoint resources.
- Inside the VNet, add an iconless `cloud-agnostic.boundary` labelled "Application tier". Put one `azure.app-services` resource labelled "App Service" and one `azure.function-apps` resource labelled "Write-through function / Repair function" inside it. Use one Functions card to represent the write-through coordinator and the repair function, as shown by the single Functions symbol in the reference.
- Also inside the VNet, but outside the application-tier boundary, add exactly two `azure.private-endpoints` resources: one labelled "Private endpoint (Azure Managed Redis)" and one labelled "Private endpoint (Azure SQL Database)". Keep them visually grouped near the application tier and clearly inside the VNet.
- Outside the VNet but still inside the region, add `azure.azure-managed-redis` labelled "Azure Managed Redis distributed cache" and `azure.sql-database` labelled "Azure SQL Database system of record". These are regional PaaS dependencies, not resources nested inside the VNet; the private endpoints provide the VNet connections to them.
- Add `azure.monitor` labelled "Azure Monitor" below or to the lower-right of the main architecture. It receives telemetry from the application tier and both data services.

Main request and data paths:
- Connect the client application to App Service with a solid arrow labelled "HTTPS requests" and stage 1.
- Connect App Service to the Managed Redis private endpoint with a solid arrow labelled "Read requests" and stage 2. This is the first read lookup.
- Connect the Managed Redis private endpoint to Azure Managed Redis with a solid private-link arrow. A cache hit is served from this distributed cache.
- Connect App Service to the SQL private endpoint with a solid arrow labelled "Cache-miss read requests" and stage 4. This is the fallback read when Redis does not contain the value.
- Connect the SQL private endpoint to Azure SQL Database with a solid private-link arrow and stage 5. SQL is the authoritative system of record.
- Connect App Service to the Functions card with a solid arrow labelled "Write requests" and stage 2. App Service delegates application-controlled writes to Functions and does not write directly to SQL.
- Connect Functions to the SQL private endpoint with a solid arrow labelled "Authoritative writes via Functions" and stage 3.
- Connect Functions to the Managed Redis private endpoint with a solid arrow labelled "Synchronous write-through cache update" and stage 4. The completed write response occurs only after SQL commits and Redis is updated.
- Keep the write-through and repair semantics visible in the Functions label or a short edge label: a durable SQL outbox records pending cache updates, and the repair function retries Redis updates idempotently after a partial failure. Do not introduce a queue or an extra database just to show the outbox concept.

Observability and network semantics:
- Add one dashed telemetry relationship for the application tier—from App Service to Azure Monitor—plus dashed relationships from Azure Managed Redis and Azure SQL Database to Azure Monitor. Do not add a duplicate Functions-to-Monitor edge when App Service already represents application-tier telemetry. Label the application-tier relationship "Metrics and logs"; keep the data-service telemetry labels short or omitted.
- Use solid arrows for request, read, write, and private-link data paths. Use dashed relationships only for telemetry and other non-request relationships.
- Let automatic routing choose connector faces for this composition. Do not add blanket `from e to w` hints: Redis, SQL, and the private endpoints may land on either side while the hierarchy is being measured. Add a face hint only when the requested composition makes that face unambiguous and the hint does not force a backtracking route.
- Make the two private endpoints visibly connect their matching VNet-side endpoint to its regional PaaS service. Do not draw a direct App Service-to-SQL or App Service-to-Redis edge that bypasses the private endpoints.
- Keep the main request/write/read path visually dominant, with the outer architecture boundary, VNet boundary, and Application tier boundary readable at normal zoom. Place Redis and SQL to the right of the VNet when the automatic layout permits, and keep Azure Monitor visually separate from the main path so telemetry does not dominate the request arrows.
- Use short orthogonal connectors with no overlaps, loops, dead ends, or redundant resources. Prefer the grammar's default numbered stage badges on the main arrows; preserve the reference's six-stage read/write story even though the shared diagram uses one consistent badge style.
- Keep edge labels concise and unique. Put "Metrics and logs" on one primary telemetry relationship and omit it from the other telemetry edges rather than repeating the same text in a crowded corridor.
- Use the canonical Azure type names from the catalog; quoted labels are display text only. Do not include the old Application Gateway, Key Vault, Storage, managed-identity, or App Insights resources from the previous example.
