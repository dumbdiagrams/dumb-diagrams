# Reference specification

Create `Azure asynchronous order processing` with Azure grammar and left-to-right flow.

## Entities and containment

- Generic client `storefront`, label `Storefront`, outside Azure.
- Azure subscription `subscription`, label `Azure subscription`.
- Azure region `region`, label `Azure region`, inside the subscription.
- Azure resource group `orders_group`, label `Order processing`, inside the region.
- API Management `api`, label `Order API`, inside the resource group.
- Function Apps `intake`, label `Order intake function`, inside the resource group.
- Azure Service Bus `queue`, label `Order queue`, inside the resource group.
- Storage Account `order_archive`, label `Order archive`, inside the resource group.
- Function Apps `processor`, label `Order processor`, inside the resource group.
- SQL Database `database`, label `Order database`, inside the resource group.
- Monitor `monitor`, label `Azure Monitor`, inside the resource group.

## Directed connections

- `storefront` → `api`, label `submit order`.
- `api` → `intake`, label `validate order`.
- `intake` → `queue`, label `queue for processing`.
- `intake` → `order_archive`, label `archive request`.
- `queue` → `processor`, label `queued order`.
- `order_archive` → `processor`, label `archive event`.
- `processor` → `database`, label `save order`.
- `processor` → `monitor`, label `processing metrics`, dashed peer connection.

No other entities or connections are part of this example.
