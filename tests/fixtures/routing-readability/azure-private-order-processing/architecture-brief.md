# Architecture brief

## Goal
Private Azure order processing with public Front Door/API Management ingress to an App Service API, private SQL and Storage access, Service Bus processing with DLQ redrive, and shared Key Vault/Monitor dependencies. Azure is the selected provider.

## Explicit requirements
- Public client enters through Front Door and API Management to App Service API.
- API reads/writes SQL through SQL private endpoint and enqueues Service Bus work.
- Function consumes Service Bus work, writes files through Storage private endpoint, and writes order status to same SQL through shared SQL private endpoint.
- API and Function read Key Vault and emit telemetry to Monitor.
- Retry-limit work moves to DLQ; operations client inspects DLQ and triggers redrive to work queue.
- API and Function VNet integration in application subnet; private endpoints in data subnet.
- Managed SQL, Storage, Service Bus, Key Vault, Monitor are outside VNet, within one subscription, region, resource group.
- Private endpoint relation direction explicit; no other services.

## Relationships and containment
- client → frontdoor: HTTPS.
- frontdoor → apim: Forward.
- apim → api: Route.
- api → sqlpe: SQL access.
- sqlpe → sql: Private link.
- api → bus: Enqueue work.
- bus → worker: Consume work.
- worker → storagepe: Write files.
- storagepe → storage: Private link.
- worker → sqlpe: Write status.
- api → vault: Read secrets.
- worker → vault: Read secrets.
- api → monitor: Telemetry.
- worker → monitor: Telemetry.
- bus → dlq: Retry limit.
- ops → dlq: Inspect DLQ.
- ops → bus: Redrive to work queue.
- Containment: subscription contains ['region'], region contains ['rg'], rg contains ['vnet', 'sql', 'storage', 'bus', 'dlq', 'vault', 'monitor', 'frontdoor', 'apim'], vnet contains ['app_subnet', 'data_subnet'], app_subnet contains ['api', 'worker'], data_subnet contains ['sqlpe', 'storagepe'].

## Inferred decisions and exclusions
- The work queue and its dead-letter subqueue are shown as distinct Service Bus components so retry transfer, inspection, and redrive remain explicit.
- The SQL private endpoint is shared between API and Function, as stated.
- Exclusion: no additional resources.
