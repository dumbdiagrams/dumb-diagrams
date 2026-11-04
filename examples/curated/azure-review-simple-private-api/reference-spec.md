# Reference specification

Create `Azure private application API` with Azure grammar and left-to-right flow.

## Entities and containment

- Generic client `client`, label `Application client`, outside the Azure subscription.
- Azure subscription `subscription`, label `Azure subscription`.
- Azure region `region`, label `Azure region`, inside the subscription.
- Azure resource group `app_group`, label `Private API resources`, inside the region.
- Azure VNet `vnet`, label `Application network`, inside the resource group.
- API Management `api`, label `API Management`, inside the VNet.
- Function Apps `handler`, label `API function`, inside the VNet.
- Private Endpoints `sql_endpoint`, label `SQL private endpoint`, inside the VNet.
- SQL Database `database`, label `Application database`, inside the resource group and region.

## Directed connections

- `client` → `api`, label `private API request`.
- `api` → `handler`, label `authorized request`.
- `handler` → `sql_endpoint`, label `private database access`.
- `sql_endpoint` → `database`, label `private link`.

No other entities or connections are part of this example.
