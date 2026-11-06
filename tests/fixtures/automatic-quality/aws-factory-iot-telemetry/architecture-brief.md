# Architecture brief

## Goal

Represent an AWS factory IoT telemetry pipeline with threshold notifications and an external dashboard.

## Explicit requirements

- A factory sensor fleet sends readings to AWS IoT Core, which routes to Kinesis Data Streams.
- A Lambda consumer normalizes each reading and writes it to Timestream; it also sends threshold alerts to SNS.
- An external operations dashboard reads telemetry from Timestream.
- Keep sensors and dashboard outside AWS Cloud, with every AWS service inside AWS Cloud. Add no other services.

## Relationships and containment

- Directed data flow: sensors → IoT Core → Kinesis Data Streams → Lambda → Timestream; Lambda also → SNS; Timestream → dashboard.
- Sensors and dashboard are external actors; all five named AWS services are inside the single AWS Cloud boundary.

## Inferred decisions and exclusions

- No additional infrastructure or supporting services are needed; all named services are represented directly.
