# Architecture brief

## Goal

Show the requested left-to-right Azure industrial IoT telemetry flow using the Azure grammar.

## Explicit requirements

- An industrial sensor fleet sends readings to IoT Hub.
- IoT Hub routes readings to Event Hubs for processing and to a Storage Account as a raw archive.
- An Azure Function App consumes the event stream, normalizes readings, and writes current equipment status to Cosmos DB.
- An external operations dashboard reads current status.
- Nest Azure resources in a subscription, region, and resource group; add no other services; use automatic routing.

## Relationships and containment

- Main sequence: sensor fleet → IoT Hub → Event Hubs → Function App → Cosmos DB.
- IoT Hub also sends a separate raw archive stream to Storage Account.
- The external dashboard reads current status from Cosmos DB.
- Azure resources are nested under one resource group, region, and subscription; the two actors remain outside those Azure boundaries.

## Inferred decisions and exclusions

- A single instance of each named Azure service represents the requested architecture; the “fleet” remains one labeled actor rather than an invented per-sensor count.
- No extra services or networking boundaries are added.
