# Architecture brief

## Goal

Show storefront orders validated by an intake Function, split to a processing queue and request archive, then consumed by a processor that saves results and emits metrics.

## Explicit requirements

- A storefront submits orders through an API.
- An intake function validates each order, queues it for processing, and archives the request.
- A processor consumes queued orders and archive events, saves completed orders in SQL, and sends processing metrics to Azure Monitor.

## Relationships and containment

- The storefront is outside Azure Cloud.
- The two Function App components, Service Bus queue, Storage Account, SQL Database, and Monitor are Azure services inside Azure Cloud.

## Inferred decisions and exclusions

- The processor is represented as a second Azure Function App because its runtime type was not specified.
- Archive events are represented as a directed Storage Account to processor relationship; no eventing service was named.
- The parallel queue and archive outputs share step 2.

