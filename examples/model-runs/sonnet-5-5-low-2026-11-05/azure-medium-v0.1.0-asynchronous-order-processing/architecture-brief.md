# Architecture brief

## Goal
Azure (grammar `azure`) asynchronous order processing, flow left-to-right.

## Explicit requirements
- Storefront submits orders through an API.
- Intake function validates each order, queues it, and archives the request.
- Processor consumes queued orders and archive events, saves completed orders in SQL, and sends processing metrics to Azure Monitor.

## Relationships and containment
- storefront -> api -> intake -> queue -> processor -> sql
- intake -> archive -> processor (archive events)
- processor -> monitor (metrics)
- No boundaries; all resources at root.

## Inferred decisions and exclusions
- API is API Management; queue is Storage Queue; archive is Storage Container; database is SQL Database; processor is a Function App.
- No VNet, identity, or other services added.
- Resources sit in one logical boundary `orders` (required parent); storefront is outside it.
