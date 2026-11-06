# Architecture brief

## Goal

Draw a left-to-right AWS factory IoT telemetry architecture with external factory sensors and an external operations dashboard.

## Explicit requirements

- The sensor fleet sends readings to AWS IoT Core, which routes them to Kinesis Data Streams.
- A Lambda consumer normalizes each reading, writes time-series data to Amazon Timestream, and sends threshold alerts to Amazon SNS.
- The external dashboard reads returned telemetry from Timestream.
- Use automatic layout, put all AWS services inside AWS Cloud, keep the sensor fleet and dashboard outside AWS Cloud, and add no other services.

## Relationships and containment

- Factory sensor fleet → IoT Core → Kinesis Data Streams → Lambda normalizer.
- Lambda sends normalized time-series data to Timestream and threshold alerts to SNS.
- Timestream returns telemetry to the external operations dashboard.
- AWS services are inside AWS Cloud; the sensor fleet and dashboard are outside.

## Inferred decisions and exclusions

- The generic client actor represents the external sensor fleet and the external dashboard because the AWS catalog supplies actors through cloud-agnostic types.
