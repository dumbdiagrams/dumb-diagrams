# Architecture brief

## Goal

Show an Azure order API and asynchronous worker with private data access, telemetry, secrets reads, and Service Bus dead-letter recovery.

## Explicit requirements

- External public client reaches App Service API through Front Door and API Management.
- API reads and writes Azure SQL through a SQL private endpoint and enqueues Service Bus work.
- Function worker consumes work, writes files through a Storage private endpoint, and updates Azure SQL database status through the shared SQL private endpoint.
- API and Function read Key Vault and emit telemetry to Azure Monitor.
- Retry-exhausted work moves to a Service Bus dead-letter queue. Operations inspects the DLQ and triggers redrive back to the work queue.
- One subscription, region, and resource group. API and Function VNet integration is shown in an application subnet; private endpoints are in a data subnet. SQL, Storage, Service Bus, Key Vault, and Monitor are managed services outside the VNet.

## Relationships and containment

The subscription contains the region and resource group. The resource group contains the VNet and managed services. The VNet contains an application subnet with App Service API and Function worker, plus a data subnet with SQL and Storage private endpoints. API and Function requests flow to their private endpoints, then from each endpoint to its managed target. Front Door flows to API Management and then API. API publishes to Service Bus; Service Bus dispatches work to Function. Operations inspects DLQ and redrives messages to the work queue.

## Inferred decisions and exclusions

- Use the canonical Azure subscription as the top-level cloud scope because the catalog has no Azure cloud boundary type; region and resource group remain explicit.
- Represent Service Bus work queue and dead-letter queue as separate Azure Service Bus resources so both directions and operations are visible.
- Private endpoint paths are explicitly directed from the application to the private endpoint, then from the private endpoint to its managed service.
- No additional services or network/security components are included.
