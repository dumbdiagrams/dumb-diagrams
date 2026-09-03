Create a diagram titled "Azure private write-through application" using the
Azure grammar and automatic left-to-right layout. Use only the canonical Azure
types in the diagram source. Preserve this containment: client outside
subscription; region and architecture boundary inside subscription; VNet,
application tier, and exactly two private endpoints inside the architecture;
Managed Redis, SQL Database, and Monitor outside the VNet but inside the region.

Connect client → App Service → private endpoints → their matching regional
services. Connect App Service → Functions → SQL private endpoint and Redis
private endpoint for write-through updates. Add dashed telemetry from App
Service, Redis, and SQL to Monitor. Do not add manual routes or decorative
resources.
