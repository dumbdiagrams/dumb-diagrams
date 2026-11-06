# Architecture brief

## Goal

Azure private order processing: Front Door and APIM to App Service API, Service Bus to Function worker, private endpoints to SQL and Storage, DLQ redrive. Provider/grammar: `azure`.

## Explicit requirements

- Public client via Front Door and APIM to App Service API; SQL via private endpoint and Service Bus; Function worker writes Storage via private endpoint and SQL via shared endpoint; Key Vault and Monitor; DLQ inspect and redrive; app and data subnets in one VNet; managed services outside the VNet in one subscription, region, resource group.
- No other services beyond those named.

## Relationships and containment

- `client` → `fd`: HTTPS.
- `fd` → `apim`: Forward.
- `apim` → `api`: Route.
- `api` → `sql_pe`: Read/write.
- `api` → `work`: Enqueue work.
- `work` → `func`: Consume work.
- `func` → `storage_pe`: Write files.
- `func` → `sql_pe`: Order status.
- `sql_pe` → `sql`: Private link.
- `storage_pe` → `storage`: Private link.
- `work` → `dlq`: Retry limit (fail).
- `ops` → `dlq`: Inspect (peer), dashed.
- `dlq` → `work`: Redrive, dashed.
- `api` → `kv`: Read secrets (peer), dashed.
- `func` → `kv`: Read secrets (peer), dashed.
- `api` → `monitor`: Telemetry (peer), dashed.
- `func` → `monitor`: Telemetry (peer), dashed.

- `client` (Public client) at root, outside any boundary.
- `ops` (Operations client) at root, outside any boundary.
- `sub` (Subscription) at root, outside any boundary.
- `region` (Region) inside `sub`.
- `rg` (Resource group) inside `region`.
- `fd` (Front Door) inside `rg`.
- `apim` (API Management) inside `rg`.
- `vnet` (VNet) inside `rg`.
- `app_subnet` (Application subnet) inside `vnet`.
- `api` (API) inside `app_subnet`.
- `func` (Function worker) inside `app_subnet`.
- `data_subnet` (Data subnet) inside `vnet`.
- `sql_pe` (SQL private endpoint) inside `data_subnet`.
- `storage_pe` (Storage private endpoint) inside `data_subnet`.
- `sql` (Azure SQL) inside `rg`.
- `storage` (Storage) inside `rg`.
- `work` (Work queue) inside `rg`.
- `dlq` (Dead-letter queue) inside `rg`.
- `kv` (Key Vault) inside `rg`.
- `monitor` (Azure Monitor) inside `rg`.

## Inferred decisions and exclusions

- Front Door and API Management sit in the resource group outside the VNet.
- Service Bus work queue and dead-letter queue are two Service Bus nodes (no catalog type for a DLQ).
- No Service Bus private endpoint was requested, so none is drawn.
- Automatic layout, left-to-right; no manual coordinates.
