Create a left-to-right Azure diagram for a private write-through application.
Place a client outside an Azure subscription, then a regional architecture
boundary containing a VNet. Put App Service and Functions in an application tier
inside the VNet, with private endpoints for Managed Redis and Azure SQL Database.
Keep the regional Redis, SQL, and Monitor services outside the VNet. Connect
request, private-link, write-through, and telemetry paths with automatic routing.
