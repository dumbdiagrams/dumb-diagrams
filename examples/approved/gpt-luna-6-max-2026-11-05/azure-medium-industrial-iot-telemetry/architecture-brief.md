# Architecture brief

## Goal

Represent an Azure industrial IoT telemetry pipeline in which a sensor fleet sends readings through IoT Hub, one branch archives raw data and another normalizes readings into current equipment status for an external operations dashboard.

## Explicit requirements

- Use Azure, with one subscription, one region, and one resource group containing all Azure resources.
- Include one industrial sensor fleet, IoT Hub, Event Hubs, Storage Account raw archive, Function App, Cosmos DB, and external operations dashboard.
- IoT Hub routes telemetry both to Event Hubs and to the raw archive.
- The Function App consumes the Event Hubs stream, normalizes readings, and writes current equipment status to Cosmos DB.
- The external dashboard reads current status.
- Add no other services and use automatic routing.
- Keep the sensor fleet and dashboard outside Azure scope.

## Relationships and containment

- Sensor fleet sends readings to IoT Hub.
- IoT Hub sends readings to Event Hubs and separately archives raw readings in the Storage Account.
- Event Hubs streams readings to the Function App; the Function App writes normalized current equipment status to Cosmos DB.
- Cosmos DB supplies current status to the external operations dashboard.
- Nest the IoT Hub, Event Hubs, Storage Account, Function App, and Cosmos DB inside the resource group, which is inside the region and subscription.
- Place the sensor fleet and dashboard outside the Azure subscription.

## Inferred decisions and exclusions

- The location and Azure resource names are descriptive placeholders because none were specified.
- The Cosmos DB to dashboard arrow represents the requested read of current status.
- No additional ingestion, monitoring, identity, networking, or dashboard hosting services are included because the request explicitly excludes other services.
- Use a left-to-right flow with automatic routing; stack the archive branch as a parallel resource.
