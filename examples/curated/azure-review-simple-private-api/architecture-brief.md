# Architecture brief

## Intent and explicit requirements

- Provider: Microsoft Azure.
- Workload: a small API with private database connectivity.
- Show the client, API gateway, function handler, private endpoint, and SQL database.

## Normalized components

- A generic application client outside the Azure subscription.
- An Azure subscription, region, and `Private API resources` resource group.
- A virtual network containing API Management, the function handler, and SQL private endpoint.
- Azure SQL Database as the application database.

## Directed relationships

- Client → API Management → API function.
- Function → SQL private endpoint → SQL Database.

## Placement and exclusions

- Keep the provider resources inside the subscription and region.
- Do not add authentication products, queues, caches, monitoring, or extra compute.
- Use left-to-right automatic layout without fixed positions or routes.
