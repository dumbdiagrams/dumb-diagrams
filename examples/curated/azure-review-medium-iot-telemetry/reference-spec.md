# Reference specification

Create `Azure IoT telemetry processing` with Azure grammar and left-to-right flow.

## Entities and containment

- `sensor_fleet` (`cloud-agnostic.actor`, label `Industrial sensor fleet`), outside Azure.
- `operations_dashboard` (`cloud-agnostic.client`, label `Operations dashboard`), outside Azure.
- `subscription` (`azure.subscription`, label `Azure subscription`).
- `region` (`azure.region`, label `Azure region`), inside `subscription`.
- `iot_group` (`azure.resource-group`, label `IoT telemetry`), inside `region`.
- `iot_hub` (`azure.iot-hub`, label `Telemetry IoT Hub`), inside `iot_group`.
- `event_hubs` (`azure.event-hubs`, label `Telemetry Event Hubs`), inside `iot_group`.
- `processor` (`azure.function-apps`, label `Telemetry processing function`), inside `iot_group`.
- `status_db` (`azure.azure-cosmos-db`, label `Current equipment status`), inside `iot_group`.
- `raw_archive` (`azure.storage-accounts`, label `Raw telemetry archive`), inside `iot_group`.

## Directed connections

- `sensor_fleet` → `iot_hub`, id `send_telemetry`, label `send telemetry`.
- `iot_hub` → `event_hubs`, id `route_to_stream`, label `route readings`.
- `iot_hub` → `raw_archive`, id `archive_readings`, label `archive raw readings`.
- `event_hubs` → `processor`, id `consume_stream`, label `consume event stream`.
- `processor` → `status_db`, id `write_status`, label `normalize and write status`.
- `status_db` → `operations_dashboard`, id `read_status`, label `read current status`.

No other entities or connections are part of this example.
