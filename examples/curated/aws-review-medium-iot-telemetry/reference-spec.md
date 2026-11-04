# Reference specification

Create `AWS factory IoT telemetry` with AWS grammar and left-to-right flow.

## Entities and containment

- Factory sensor fleet `sensors`, label `Factory sensor fleet`, outside AWS.
- AWS cloud `aws_cloud`, label `AWS Cloud`.
- IoT Core resource `iot_core`, label `AWS IoT Core`, inside AWS Cloud.
- Kinesis Data Streams resource `telemetry_stream`, label `Kinesis Data Streams`, inside AWS Cloud.
- Lambda resource `consumer`, label `Lambda telemetry consumer`, inside AWS Cloud.
- Timestream resource `time_series`, label `Amazon Timestream`, inside AWS Cloud.
- SNS resource `alerts`, label `Amazon SNS`, inside AWS Cloud.
- Operations dashboard `dashboard`, label `Operations dashboard`, outside AWS.

## Directed connections

- `sensors` → `iot_core`, id `send_readings`, label `Sensor readings`.
- `iot_core` → `telemetry_stream`, id `route_readings`, label `Route readings`.
- `telemetry_stream` → `consumer`, id `consume_readings`, label `Consume stream`.
- `consumer` → `time_series`, id `write_time_series`, label `Normalized readings`.
- `consumer` → `alerts`, id `publish_alerts`, label `Threshold alerts`.
- `time_series` → `dashboard`, id `read_time_series`, label `Telemetry data`.

The dashboard reads directly from Timestream; this edge shows the returned telemetry. No other entities or connections are part of this example.
