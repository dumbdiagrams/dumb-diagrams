# Architecture brief

## Goal

Model an Azure asynchronous order-processing system with an explicit intake path, queued processing, archive-event delivery, SQL persistence, and operational metrics.

## Explicit requirements

- A storefront submits orders through an API.
- An intake function validates each order, queues it for processing, and archives the request.
- A processor consumes queued orders and archive events, saves completed orders in SQL, and sends processing metrics to Azure Monitor.
- Use Azure grammar and a left-to-right layout.

## Relationships and containment

- Storefront → API → intake function.
- Intake function → processing queue and archive storage.
- Archive storage → Event Grid subscription → processor; queue → processor.
- Processor → SQL Database for completed orders.
- Processor → Azure Monitor through a directed dashed support flow.
- Azure resources are contained by an Azure subscription with a region; storefront remains outside that scope. No resource group is specified.

## Inferred decisions and exclusions

- API Management Services represents the generic API ingress because a concrete Azure API component is needed to show the storefront's API hop.
- A second Function App represents the processor because the request names a distinct consumer role.
- Event Grid Subscription delivers archive events to that processor, matching the specified archive-event consumption.
- A Storage Account provides the archive destination.
- The processing queue is represented by one Azure Service Bus resource.
- No resource group or unrelated infrastructure services are added.
- The main order path is laid out left-to-right; metrics are a dashed supporting flow.
