# Architecture brief

## Goal

Show a private Azure order-processing path from a public client through Front Door, API Management, and an App Service API, with shared private SQL access and asynchronous file work handled by a Function worker.

## Explicit requirements

- A public client enters through Front Door and API Management to an App Service API.
- The API reads and writes Azure SQL through a SQL Private Endpoint and enqueues work in Service Bus.
- A Function worker consumes Service Bus work, writes files through a Storage Private Endpoint, and writes order status through the shared SQL Private Endpoint.
- The API and Function read Key Vault and emit telemetry to Azure Monitor.
- Work reaching the Service Bus retry limit moves to a dead-letter queue; an operations client inspects the DLQ and triggers redrive to the work queue.
- The API and Function use VNet integration in an application subnet. Private Endpoints are in a data subnet.
- SQL, Storage, Service Bus, Key Vault, and Monitor stay outside the VNet but inside one subscription, region, and resource group.
- Show the direction from each Private Endpoint to its managed target, and add no other services.

## Relationships and containment

- Public client → Front Door → API Management → App Service API.
- API → shared SQL Private Endpoint → SQL Database; API → Service Bus work queue → Function worker.
- Work queue → DLQ on retry exhaustion; operations client inspects DLQ and sends redrive work back to the work queue.
- Function worker → Storage Private Endpoint → Storage Account for file writes, and Function worker → shared SQL Private Endpoint for order-status writes.
- Both application components read Key Vault and send telemetry to Azure Monitor through supporting flows.
- API and Function App are in the application subnet. SQL and Storage Private Endpoints are in the data subnet. Managed services remain outside the VNet in the resource group.

## Inferred decisions and exclusions

- Use one Azure Service Bus namespace boundary containing separate work-queue and DLQ nodes so the retry and redrive paths are explicit. These nodes represent queues under the one requested Service Bus service.
- Group Key Vault and Monitor in a logical support boundary to keep the application path readable; this is not an added service.
- Group SQL and Storage in a logical data-services boundary outside the VNet to clarify the two Private Endpoint targets; this is not an added service.
- Add only the two requested clients as cloud-agnostic actors. No other Azure services or network components are included.
- Keep main processing flows left-to-right and use dashed supporting flows for secrets, telemetry, and operations.
