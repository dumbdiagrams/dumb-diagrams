Create a diagram titled "Private Azure App Service" using the AWS grammar's deterministic layout conventions with canonical Azure catalog resources and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

Composition and hierarchy:
- Put a cloud-agnostic web client outside an Azure subscription.
- Inside the subscription, create one region labelled "Azure region · West Europe".
- Inside that region, create one Azure virtual network with three clearly separated subnets: "Application Gateway subnet", "App Service integration subnet", and "Private endpoint subnet". The integration and private-endpoint subnets must remain separate.
- Place Azure Application Gateway + WAF in the gateway subnet. In the integration subnet, place a network-interface catalog resource labelled "Virtual interface" to represent the virtual interfaces mounted to App Service workers by regional VNet integration. Place four private endpoints in the private endpoint subnet for App Service, SQL, Key Vault, and Storage.
- Outside the VNet but inside the region, add an iconless `cloud-agnostic.boundary` named "Platform services" with four compact nested boundaries: "Application platform", "Identity", "Private dependencies", and "Network controls". Use a dashed blue line with no fill for the outer boundary, then purple, orange, teal, and blue accents for the nested boundaries. Put App Service, Application Insights, and Azure Monitor in the application boundary; a managed identity and Microsoft Entra ID in the identity boundary; Azure SQL Database, Azure Key Vault, and Azure Storage in private dependencies; and DDoS protection plus Private DNS zones in network controls.
- In the application boundary, show the App Service service plus a compact "Zone-redundant instances" boundary containing three App Service instance cards labelled Zone 1, Zone 2, and Zone 3. Label the storage dependency "Storage for deployment".

Connections and numbered stages:
1. Connect the web client to Application Gateway as the public request entry point.
2. Connect Application Gateway to the App Service private endpoint.
3. Connect the App Service private endpoint to App Service.
4. Connect App Service to the virtual interface as the outbound VNet-integration path.
5. Continue the numbered data path from the virtual interface through the SQL private endpoint.
6. Connect the SQL private endpoint to Azure SQL Database.
- Connect App Service to the virtual interface with a solid, arrowed relationship labelled "VNet integration · outbound". This is an outbound path from App Service into the VNet; it is not the inbound path to the app.
- Connect the virtual interface to the SQL, Key Vault, and Storage private endpoints, and connect each of those endpoints to its matching PaaS service. Label the Storage service "Storage for deployment". These are the private-link paths used by App Service after DNS resolves the service names.
- Add the dashed TLS-certificate relationship from Application Gateway to the Key Vault private endpoint, then keep the Key Vault private endpoint connected to Key Vault.
- Add the dashed token-issuance relationship from managed identity to Microsoft Entra ID, and dashed telemetry relationships from App Service to Application Insights to Azure Monitor. Keep the identity boundary visually separate from the main network path; the managed identity represents the App Service workload identity used for authorized Key Vault, SQL, and Storage access.
- Link Private DNS zones into the private endpoint path with a dashed "private resolution" relationship, and add a dashed DDoS relationship to Application Gateway. Describe the DNS zones as linked to the VNet and resolving the private endpoint records, rather than as another application hop.

Keep the main request and data path visually dominant. Use the subnet boundaries for network scope, `cloud-agnostic.boundary` for platform concerns, short orthogonal connectors, and no overlaps, loops, dead ends, or redundant resources. Make the three subnets readable at normal zoom, especially the full "App Service integration subnet" header. Use the canonical Azure type names from the catalog; the quoted labels are display text only.
