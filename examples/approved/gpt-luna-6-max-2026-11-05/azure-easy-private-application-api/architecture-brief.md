# Architecture brief

## Goal

Show a simple private Azure application API: a client enters through API Management, which routes to a Function App in an application VNet; the function uses a private endpoint to reach Azure SQL.

## Explicit requirements

- A client calls API Management, which routes requests to an Azure Function.
- The function accesses an Azure SQL database through a private endpoint in the application network.

## Relationships and containment

- The Azure Function and SQL private endpoint are contained in the application VNet.
- API Management and Azure SQL remain outside the VNet; Azure SQL remains within Azure Cloud.

## Inferred decisions and exclusions

- The function is shown inside the application VNet so its private endpoint access is clear.
- No subscription or region boundary was requested, so the cloud and application network are the only Azure boundaries.

