# Architecture brief

## Goal
Azure (`azure` grammar) private order processing: public client via Front Door and API Management to an App Service API; Function worker consumes Service Bus work; data services reached privately.

## Explicit requirements
- Client -> Front Door -> API Management -> App Service API.
- API reads/writes Azure SQL via SQL private endpoint; enqueues to Service Bus.
- Function consumes Service Bus, writes files to Storage via Storage private endpoint, writes order status to SQL via the shared SQL private endpoint.
- API and Function read Key Vault and emit telemetry to Monitor.
- Retry-exhausted work moves to a dead-letter queue; operations client inspects DLQ and triggers redrive to the work queue.
- API and Function in an application subnet; private endpoints in a data subnet.
- SQL, Storage, Service Bus, Key Vault, Monitor outside the VNet, within one subscription, region, and resource group.
- Private endpoint edges point endpoint -> service (consumer -> endpoint -> service).
- No other services.

## Relationships and containment
Subscription > Region > Resource Group > {Front Door, API Management, VNet {app subnet, data subnet}, managed services}. Client and operations client are outside.

## Inferred decisions and exclusions
- Service Bus is the work queue; the DLQ is a separate logical queue node (cloud-agnostic queue) shown as the Service Bus dead-letter sub-queue.
- Front Door, API Management outside the VNet (managed PaaS). No private endpoints for Service Bus, Key Vault or Monitor (not requested).
