# Architecture brief

## Goal

Show a left-to-right Azure IoT telemetry pipeline with raw archiving and current-state processing, nested in the requested Azure subscription, region, and resource group.

## Explicit requirements

- An industrial sensor fleet sends readings to Azure IoT Hub.
- IoT Hub routes readings to Event Hubs for processing and a Storage Account for a raw archive.
- An Azure Function App consumes the event stream, normalizes readings, and writes current equipment status to Cosmos DB.
- An external operations dashboard reads the current status.
- Use automatic routing and add no other services.

## Relationships and containment

- The sensor fleet and dashboard are external to Azure Cloud.
- IoT Hub, Event Hubs, Storage Account, Function App, and Cosmos DB are inside the resource group, region, subscription, and cloud.

## Inferred decisions and exclusions

- No services beyond the five named Azure services are added.
- The two IoT Hub routes share step 2 because they are parallel outputs.

