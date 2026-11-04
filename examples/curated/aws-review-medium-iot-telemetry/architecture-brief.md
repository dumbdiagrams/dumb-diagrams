# Architecture brief

## Goal

- Provider: AWS.
- Show factory sensor telemetry ingestion, normalization, time-series storage, alerting, and dashboard reads.

## Explicit requirements

- The external factory sensor fleet sends readings to AWS IoT Core.
- IoT Core routes readings to Kinesis Data Streams, which feeds a Lambda consumer.
- Lambda normalizes readings, writes them to Timestream, and sends threshold alerts to SNS.
- An external operations dashboard reads time-series data from Timestream; show the data path from Timestream to the dashboard.
- Use AWS grammar and automatic left-to-right layout. Add no unrelated services.

## Relationships and containment

- Keep the sensor fleet and operations dashboard outside AWS Cloud.
- Contain IoT Core, Kinesis Data Streams, Lambda, Timestream, and SNS in AWS Cloud.
- Main path: sensor fleet → IoT Core → Kinesis Data Streams → Lambda → Timestream.
- Branch Lambda to SNS for threshold alerts; show the dashboard reading from Timestream.

## Inferred decisions and exclusions

- Show one node for each named participant or service, with no inferred region or network boundary.
- Do not add notification recipients, VPC, monitoring, IAM, or other services.
