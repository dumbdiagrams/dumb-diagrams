# Architecture brief

## Goal

Model an industrial sensor telemetry pipeline on Microsoft Azure, showing the streaming processing path, raw archive branch, and dashboard status read.

## Explicit requirements

- Use Azure grammar and a left-to-right primary flow.
- Show an industrial sensor fleet sending telemetry to IoT Hub.
- Route readings from IoT Hub to Event Hubs and a raw archive in a Storage Account.
- Consume the Event Hubs stream with an Azure Function App, normalize readings, and write current equipment status to Cosmos DB.
- Show an external operations dashboard reading the current status.
- Use only the requested Azure services and automatic layout.

## Relationships and containment

- The external sensor fleet sends telemetry to IoT Hub.
- IoT Hub routes readings to both Event Hubs and the raw archive.
- Event Hubs feeds the telemetry processing Function App; the function writes normalized current status to Cosmos DB.
- The external operations dashboard reads current status from Cosmos DB.
- Nest the Azure region in the subscription, the resource group in the region, and all five Azure services in the resource group. Keep both external actors outside Azure.

## Inferred decisions and exclusions

- Treat Event Hubs as the function's event source and show the archive as a separate IoT Hub routing branch.
- Model the dashboard read as a directed connection from Cosmos DB to the dashboard.
- Do not add networking, monitoring, identity, or other services. Use automatic left-to-right layout without fixed positions or routes.
