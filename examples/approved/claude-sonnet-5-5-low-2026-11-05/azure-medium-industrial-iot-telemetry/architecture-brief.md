# Architecture brief

## Goal

Left-to-right Azure IoT pipeline: IoT Hub routing to Event Hubs and raw archive; Function normalizes into Cosmos DB; external dashboard reads status. Provider/grammar: `azure`.

## Explicit requirements

- Sensor fleet -> IoT Hub -> Event Hubs and Storage Account archive; Function App consumes, normalizes, writes status to Cosmos DB; external dashboard reads status. Nest in subscription, region, resource group. No other services.
- No other services beyond those named.

## Relationships and containment

- `sensors` → `hub`: Readings.
- `hub` → `events`: Route events.
- `hub` → `archive`: Raw archive.
- `events` → `func`: Consume stream.
- `func` → `cosmos`: Current status.
- `dashboard` → `cosmos`: Read status.

- `dashboard` (Operations dashboard) at root, outside any boundary.
- `sensors` (Industrial sensor fleet) at root, outside any boundary.
- `sub` (Subscription) at root, outside any boundary.
- `region` (Region) inside `sub`.
- `rg` (Resource group) inside `region`.
- `hub` (IoT Hub) inside `rg`.
- `archive` (Raw archive) inside `rg`.
- `events` (Event Hubs) inside `rg`.
- `func` (Function App) inside `rg`.
- `cosmos` (Equipment status) inside `rg`.

## Inferred decisions and exclusions

- None; the request fully determined the structure.
- Automatic layout, left-to-right; no manual coordinates.
