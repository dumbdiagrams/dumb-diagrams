# Architecture brief

## Intent and explicit requirements

- Provider: Microsoft Azure.
- Workload: accept orders synchronously and complete order processing asynchronously.
- Preserve a clear intake branch and a processor fan-in from queued and archived order events.

## Normalized components

- A generic storefront outside Azure.
- An Azure subscription, region, and `Order processing` resource group.
- API Management and an order-intake Function App.
- Azure Service Bus for queued work and a Storage Account for archived intake requests.
- An order-processing Function App, Azure SQL Database, and Azure Monitor.

## Directed relationships

- Storefront → Order API → intake function.
- Intake function branches to Service Bus and request archive.
- Queue and archive events both feed the processor.
- Processor writes orders to SQL and emits metrics to Azure Monitor.

## Placement and exclusions

- Keep all Azure services inside the subscription, region, and resource group.
- Do not add caches, extra queues, identity services, or additional compute.
- Use left-to-right automatic layout without fixed positions or routes.
