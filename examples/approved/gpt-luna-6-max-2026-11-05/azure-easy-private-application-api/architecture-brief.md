# Architecture brief

## Goal

Show a simple Azure API path from a client through API Management to a Function App, with SQL access routed through a private endpoint in the application network.

## Explicit requirements

- A client calls API Management, which routes requests to an Azure Function.
- The Function accesses Azure SQL through a private endpoint in the application network.

## Relationships and containment

- The client calls API Management; API Management routes to the Function App.
- The Function App reaches SQL Database through a Private Endpoint.
- The Function App is in the application subnet; the Private Endpoint is in a subnet in the same VNet. SQL Database remains outside the VNet.

## Inferred decisions and exclusions

- Add one Azure subscription, region, and resource group to scope the resources; no location or resource-group name was specified.
- Use an application VNet with separate application and private-endpoint subnets to make the requested private endpoint placement clear.
- Place API Management outside the VNet as the client-facing entry point. Its public/private exposure was not specified.
- Do not add supporting services or additional application stages.
