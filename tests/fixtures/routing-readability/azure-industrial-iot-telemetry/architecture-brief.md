# Architecture brief

## Goal
Azure industrial IoT telemetry pipeline, with IoT Hub fan-out to event processing and raw storage, status materialization in Cosmos DB, and dashboard reads.

## Explicit requirements
- Industrial sensor fleet sends readings to IoT Hub.
- IoT Hub routes readings to Event Hubs for processing and to a Storage Account for raw archive.
- Function App consumes the event stream, normalizes readings, and writes current equipment status to Cosmos DB.
- An external operations dashboard reads current status.
- Resources are nested in subscription, region, and resource group; no other services; automatic routing.

## Relationships and containment
- sensors → hub: Readings.
- hub → events: Route.
- hub → archive: Archive.
- events → fn: Consume.
- fn → cosmos: Update status.
- dashboard → cosmos: Read status.
- Containment: subscription contains ['region'], region contains ['rg'], rg contains ['hub', 'events', 'archive', 'fn', 'cosmos'].

## Inferred decisions and exclusions
- Event Hubs feeds the Function App as the event stream consumer.
- Sensor fleet and dashboard are cloud-agnostic actors.
- Exclusion: no additional resources.
