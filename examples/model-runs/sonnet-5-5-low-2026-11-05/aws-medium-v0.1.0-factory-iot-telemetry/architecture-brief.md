# Architecture brief

## Goal
Provider: `aws`. Left-to-right factory IoT telemetry pipeline with automatic layout.

## Explicit requirements
- Sensor fleet sends readings to AWS IoT Core, which routes to Kinesis Data Streams.
- Lambda consumer reads the stream, writes time-series data to Timestream, and sends threshold alerts to SNS.
- External operations dashboard reads from Timestream; the returned telemetry path is shown.
- Sensor fleet and dashboard are outside AWS Cloud; all AWS services are inside it.
- No other services.

## Relationships and containment
- sensors -> iot_core -> stream -> consumer -> timestream; consumer -> alerts.
- dashboard -> timestream (query) and timestream -> dashboard (telemetry return).
- Sensor fleet and dashboard at root; AWS services inside `aws_cloud`.

## Inferred decisions and exclusions
- Sensor fleet and dashboard use cloud-agnostic device and client actors.
- Stream-to-Lambda is drawn as a consumer read edge. No extra services added.
