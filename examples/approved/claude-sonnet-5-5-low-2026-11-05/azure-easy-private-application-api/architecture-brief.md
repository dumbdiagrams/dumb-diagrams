# Architecture brief

## Goal

Azure API via API Management and Function, reaching Azure SQL through a private endpoint in the application network. Provider/grammar: `azure`.

## Explicit requirements

- A client calls API Management, which routes to an Azure Function; the function accesses an Azure SQL database through a private endpoint in the application network.

## Relationships and containment

- `client` → `apim`: HTTPS.
- `apim` → `func`: Route.
- `func` → `sql_pe`: Private access.
- `sql_pe` → `sql`: Private link.

- `client` (Client) at root, outside any boundary.
- `sub` (Azure subscription) at root, outside any boundary.
- `region` (Azure region) inside `sub`.
- `apim` (API Management) inside `region`.
- `func` (Function) inside `region`.
- `vnet` (Application network) inside `region`.
- `sql_pe` (SQL private endpoint) inside `vnet`.
- `sql` (Azure SQL) inside `region`.

## Inferred decisions and exclusions

- Subscription and region boundaries are needed to host Azure resources.
- The private endpoint relation is drawn endpoint -> SQL.
- Automatic layout, left-to-right; no manual coordinates.
