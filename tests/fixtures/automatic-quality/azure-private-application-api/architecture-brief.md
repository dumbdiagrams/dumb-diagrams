# Architecture brief

## Goal

Model a private Azure application API using the Azure grammar.

## Explicit requirements

- A client calls API Management, which routes requests to an Azure Function.
- The Function accesses Azure SQL through a private endpoint in the application network.

## Relationships and containment

- Directed request path: client → API Management → Function → SQL private endpoint → Azure SQL.
- The private endpoint is inside the application VNet; Azure SQL is outside that network.

## Inferred decisions and exclusions

- “Application network” is represented as one Azure VNet, the smallest catalog boundary that can contain the endpoint.
- The client is a cloud-agnostic actor. No other services or network placement are inferred.
