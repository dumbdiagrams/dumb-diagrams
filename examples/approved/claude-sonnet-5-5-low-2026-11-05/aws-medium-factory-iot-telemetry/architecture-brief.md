# Architecture brief

## Goal

Left-to-right AWS factory IoT telemetry pipeline with external sensors and dashboard. Provider/grammar: `aws`.

## Explicit requirements

- Factory sensor fleet sends readings to AWS IoT Core, routed to Kinesis Data Streams; Lambda normalizes to Timestream and sends threshold alerts to SNS; external dashboard reads Timestream. No other services.
- No other services beyond those named.

## Relationships and containment

- `sensors` → `iot`: Readings.
- `iot` → `stream`: Route readings.
- `stream` → `consumer`: Consume.
- `consumer` → `tsdb`: Time-series writes.
- `consumer` → `alerts`: Threshold alerts.
- `dashboard` → `tsdb`: Read query.
- `tsdb` → `dashboard`: Returned telemetry, dashed.

- `sensors` (Factory sensor fleet) at root, outside any boundary.
- `aws` (AWS Cloud) at root, outside any boundary.
- `iot` (IoT Core) inside `aws`.
- `stream` (Kinesis Data Streams) inside `aws`.
- `consumer` (Normalizing consumer) inside `aws`.
- `tsdb` (Timestream) inside `aws`.
- `alerts` (Threshold alerts) inside `aws`.
- `dashboard` (Operations dashboard) at root, outside any boundary.

## Inferred decisions and exclusions

- Returned telemetry is a dashed unnumbered flow so the request/response pair does not break step ordering.
- Automatic layout, left-to-right; no manual coordinates.
