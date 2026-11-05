# Architecture brief

## Goal

Show private Azure order processing with a public Front Door and API Management entry path, App Service and Function integration in one application subnet, private endpoints in a data subnet, and managed services outside the VNet.

## Explicit requirements

- A public client enters through Front Door and API Management to an App Service API.
- The API reads and writes Azure SQL through a SQL private endpoint and enqueues work in Service Bus.
- A Function worker consumes Service Bus work, writes files through a Storage private endpoint, and writes order status to Azure SQL through the shared SQL private endpoint.
- The API and Function read Key Vault and emit telemetry to Azure Monitor.
- Service Bus work that reaches its retry limit moves to a dead-letter queue; operations inspects the DLQ and triggers redrive to the work queue.
- Show API and Function VNet integration in an application subnet, and private endpoints in a data subnet.
- Show one cloud, one subscription, one region, one resource group.
- SQL, Storage, Service Bus, Key Vault, and Monitor are managed services outside the VNet.

## Relationships and containment

- The public client and operations client are outside Azure Cloud.
- Application VNet contains an application subnet for App Service/Function integration and a data subnet for two private endpoints.
- The subscription, region, resource group, VNet, and both subnets are nested in the required order.
- Managed services are within the resource group but outside the VNet.

## Inferred decisions and exclusions

- Work queue and DLQ are represented as two Service Bus queue resources so failure and redrive directions remain explicit.
- Operations inspection and redrive control links, plus Key Vault and Monitor links, are dashed peer connectors and therefore unnumbered.
- The shared SQL endpoint sends its private-endpoint relation to SQL after both API and Function access relationships are represented.

