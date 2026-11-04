# Reference specification

## Entities

| ID | Canonical type | Label | Containment |
| --- | --- | --- | --- |
| client | cloud-agnostic.client | Public order client | External |
| ops | cloud-agnostic.client | Operations client | External |
| subscription | azure.subscription | Azure subscription | Root |
| region | azure.region | Azure region | subscription |
| rg | azure.resource-group | Order processing resource group | region |
| vnet | azure.vnet | Order processing VNet | rg |
| app_subnet | azure.subnet | Application subnet | vnet |
| api | azure.app-services | App Service API | app_subnet |
| worker | azure.function-apps | Function worker | app_subnet |
| data_subnet | azure.subnet | Data subnet | vnet |
| sql_pe | azure.private-endpoints | SQL private endpoint | data_subnet |
| storage_pe | azure.private-endpoints | Storage private endpoint | data_subnet |
| managed | cloud-agnostic.boundary | Managed services outside VNet | rg |
| front_door | azure.front-door-and-cdn-profiles | Front Door | managed |
| apim | azure.api-management-services | API Management | managed |
| sql | azure.sql-database | Azure SQL database | managed |
| storage | azure.storage-accounts | Storage account | managed |
| work | azure.azure-service-bus | Service Bus work queue | managed |
| dlq | azure.azure-service-bus | Service Bus dead-letter queue | managed |
| key_vault | azure.key-vaults | Key Vault | managed |
| monitor | azure.monitor | Azure Monitor | managed |

## Connections

| ID | From -> to | Meaning |
| --- | --- | --- |
| public_entry | client -> front_door | HTTPS requests |
| route_api | front_door -> apim | Route request |
| api_request | apim -> api | API request |
| api_sql_request | api -> sql_pe | SQL read and write |
| api_sql_private_link | sql_pe -> sql | Private endpoint to SQL |
| enqueue | api -> work | Enqueue order work |
| consume | work -> worker | Consume work |
| function_storage_request | worker -> storage_pe | Write files |
| storage_private_link | storage_pe -> storage | Private endpoint to Storage |
| worker_sql_request | worker -> sql_pe | Write order status |
| api_secret_read | api -> key_vault | Read secrets |
| worker_secret_read | worker -> key_vault | Read secrets |
| api_telemetry | api -> monitor | Telemetry |
| worker_telemetry | worker -> monitor | Telemetry |
| retry_exhausted | work -> dlq | Retry limit reached |
| inspect_dlq | ops -> dlq | Inspect dead-letter messages |
| trigger_redrive | ops -> work | Trigger redrive |
| redrive | dlq -> work | Redrive messages |
