# Architecture brief

## Goal

Model the requested Azure asynchronous order processing workflow using the Azure grammar.

## Explicit requirements

- A storefront submits orders through an API.
- An intake function validates each order, queues it, and archives the request.
- A processor consumes queued orders and archive events, saves completed orders in SQL, and sends processing metrics to Azure Monitor.

## Relationships and containment

- Storefront → intake function → Service Bus work queue.
- Intake function also writes the request to a Storage Account archive.
- Service Bus delivers queued orders to the processor; storage archive events are delivered to the processor through Event Grid.
- Processor writes completed orders to SQL and sends metrics to Monitor.

## Inferred decisions and exclusions

- The API is represented by the storefront-to-intake-function request edge because no separate API service is named.
- Service Bus is the Azure queue implementation; Storage Account is the request archive.
- A second Function App represents the processor runtime, and Event Grid Subscription represents delivery of archive events. These are the smallest Azure-native interpretations of the described roles and event trigger.
- No networking, security, or other supporting services are added.
