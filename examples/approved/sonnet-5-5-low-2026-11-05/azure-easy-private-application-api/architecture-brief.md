# Architecture brief

## Goal
Provider: azure. A simple private Azure application API: a client calls API Management, which routes to an Azure Function; the function reaches Azure SQL through a private endpoint in the application network.

## Explicit requirements
- Client calls API Management.
- API Management routes requests to a Function App.
- Function accesses an Azure SQL database through a private endpoint.
- Private endpoint is in the application network.

## Relationships and containment
- client -> apim -> function -> private endpoint -> SQL database, left to right.
- Function and private endpoint sit inside the virtual network.
- Client, API Management and SQL database are outside the network (SQL is managed PaaS).

## Inferred decisions and exclusions
- Function placed in the virtual network so it reaches the private endpoint.
- No monitoring, identity, or other unrequested services.
