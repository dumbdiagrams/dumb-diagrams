# Architecture brief

## Goal

Azure order intake via API and Function, queued and archived, processed by a Function into SQL with metrics to Monitor. Provider/grammar: `azure`.

## Explicit requirements

- A storefront submits orders through an API; an intake function validates, queues, and archives the request. A processor consumes queued orders and archive events, saves completed orders in SQL, and sends metrics to Azure Monitor.

## Relationships and containment

- `storefront` → `api`: Submit order.
- `api` → `intake`: Validate.
- `intake` → `queue`: Queue order.
- `intake` → `archive`: Archive request.
- `queue` → `processor`: Queued orders.
- `archive` → `processor`: Archive events.
- `processor` → `sql`: Save orders.
- `processor` → `monitor`: Metrics.

- `storefront` (Storefront) at root, outside any boundary.
- `sub` (Azure subscription) at root, outside any boundary.
- `region` (Azure region) inside `sub`.
- `api` (Order API) inside `region`.
- `intake` (Intake function) inside `region`.
- `queue` (Order queue) inside `region`.
- `archive` (Request archive) inside `region`.
- `processor` (Processor) inside `region`.
- `sql` (Orders SQL) inside `region`.
- `monitor` (Azure Monitor) inside `region`.

## Inferred decisions and exclusions

- Storage Queue is the order queue and a Storage Account is the archive; archive events flow straight to the processor since no event service was requested.
- Subscription and region boundaries host the Azure resources.
- Automatic layout, left-to-right; no manual coordinates.
