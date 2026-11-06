# Architecture brief

## Goal
Stream factory sensor telemetry through AWS IoT Core, Kinesis, and Lambda into Timestream, with SNS threshold alerts and an external dashboard.

## Explicit requirements
- AWS services inside one AWS Cloud boundary; factory sensor fleet and dashboard outside it.
- Lambda normalizes readings, writes time-series data to Timestream, and sends threshold alerts to SNS.
- Dashboard reads returned telemetry from Timestream. Automatic layout; no extra services.

## Relationships and containment
- Sensors → IoT Core → Kinesis Data Streams → Lambda. Lambda → Timestream and SNS. Timestream → external dashboard.

## Inferred decisions and exclusions
- The dashboard read relationship is represented as a directed Timestream-to-dashboard edge as requested. No extra resources.
