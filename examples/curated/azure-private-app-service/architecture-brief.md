# Architecture brief

This Azure example shows a private write-through application. A client reaches
App Service, which reads through private endpoints from Managed Redis and Azure
SQL Database, while Functions coordinates authoritative writes and cache repair.

The subscription and region contain one architecture boundary. The VNet holds
the application tier and both private endpoints; Redis, SQL, and Monitor remain
regional services outside the VNet. Solid arrows are request/data paths and
dashed arrows are telemetry.
