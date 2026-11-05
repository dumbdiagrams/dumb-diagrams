# Architecture brief

## Goal
Azure (grammar `azure`) left-to-right IoT telemetry architecture with automatic routing.

## Explicit requirements
- Industrial sensor fleet sends readings to IoT Hub.
- IoT Hub routes to Event Hubs and to a Storage Account (raw archive).
- Function App consumes the event stream, normalizes, writes current status to Cosmos DB.
- External operations dashboard reads current status.
- Resources nested in subscription, region, resource group. No other services.

## Relationships and containment
- sensors -> IoT Hub -> Event Hubs -> Function App -> Cosmos DB; IoT Hub -> Storage Account; dashboard -> Cosmos DB (read).
- Subscription > Region > Resource Group contains all Azure services; sensors and dashboard are outside.

## Inferred decisions and exclusions
- Sensors use `cloud-agnostic.device`, dashboard uses `cloud-agnostic.client`, both external.
- Dashboard edge points from dashboard to Cosmos DB (reads). No extra services.
