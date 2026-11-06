# Architecture brief

## Goal

Model the specified private Azure order processing architecture using the Azure grammar.

## Explicit requirements

- Public client enters through Front Door → API Management → App Service API.
- API reads and writes Azure SQL through one SQL private endpoint and enqueues work in Service Bus.
- A Function worker consumes Service Bus work, writes files through a Storage private endpoint, and writes status to the same SQL database through the shared SQL private endpoint.
- API and Function read Key Vault and emit telemetry to Azure Monitor.
- Work that reaches its retry limit moves to a dead-letter queue; operations client inspects the DLQ and triggers redrive to the work queue.
- App Service API and Function are VNet integrated in an application subnet; private endpoints are in a data subnet.
- SQL, Storage, Service Bus, Key Vault, and Monitor are managed services outside the VNet and inside one subscription, region, and resource group. No other services are to be added.

## Relationships and containment

- Directed request path: public client → Front Door → API Management → App Service API.
- App Service API → SQL private endpoint → Azure SQL; Function worker → the same SQL private endpoint → Azure SQL.
- App Service API → Service Bus work queue → Function worker; work queue → dead-letter queue on retry limit.
- Function worker → Storage private endpoint → Storage Account.
- API and Function each read Key Vault and emit telemetry to Monitor.
- Operations client → DLQ to inspect it and → work queue to trigger redrive.
- One subscription contains one region and one resource group. The resource group contains one VNet with application and data subnets. API and Function sit in the application subnet; the two private endpoints sit in the data subnet. The named managed services remain outside the VNet but within the resource group.

## Inferred decisions and exclusions

- The two Service Bus queue endpoints are drawn as two Azure Service Bus nodes labeled Work Queue and Dead-Letter Queue; they represent queue endpoints within the requested Service Bus, not extra service categories.
- Front Door, API Management, App Service API, and Function are in the resource group; only App Service API and Function have the explicitly requested subnet integration.
- Private endpoint arrows point from each consumer to the endpoint and then from endpoint to managed target, making the requested relation direction visible.
- No other services or hidden dependencies are introduced.
