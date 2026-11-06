# Architecture brief

## Goal

AWS document intake with SQS-driven Fargate workers in two AZs of one VPC, S3 in/out, DynamoDB status, SNS completion, CloudFront download, DLQ with redrive. Provider/grammar: `aws`.

## Explicit requirements

- Client submits via API Gateway to Lambda intake handler -> input S3 and SQS jobs; two Fargate workers in two AZs/private subnets of one VPC read input S3, write output S3, update DynamoDB, publish SNS; CloudFront to output S3; DLQ with ops inspect and redrive; SNS notifies operations.
- No other services beyond those named.

## Relationships and containment

- `client` → `apigw`: Submit documents.
- `apigw` → `intake`: Invoke.
- `intake` → `s3_in`: Store originals.
- `intake` → `jobs`: Queue jobs.
- `jobs` → `worker1`: Jobs.
- `jobs` → `worker2`: Jobs.
- `s3_in` → `worker1`: Read input.
- `s3_in` → `worker2`: Read input.
- `worker1` → `s3_out`: Write output.
- `worker2` → `s3_out`: Write output.
- `worker1` → `status`: Update status.
- `worker2` → `status`: Update status.
- `worker1` → `done`: Publish completion.
- `worker2` → `done`: Publish completion.
- `done` → `ops`: Completion notice.
- `client` → `cdn`: Download.
- `cdn` → `s3_out`: Origin fetch.
- `jobs` → `dlq`: Max attempts (fail).
- `ops` → `dlq`: Inspect (peer), dashed.
- `ops` → `status`: Inspect (peer), dashed.
- `dlq` → `jobs`: Redrive, dashed.

- `client` (Document intake client) at root, outside any boundary.
- `ops` (Operations user) at root, outside any boundary.
- `aws` (AWS Cloud) at root, outside any boundary.
- `region` (AWS Region) inside `aws`.
- `apigw` (API Gateway) inside `region`.
- `intake` (Intake handler) inside `region`.
- `s3_in` (Input bucket) inside `region`.
- `jobs` (Jobs queue) inside `region`.
- `dlq` (Dead-letter queue) inside `region`.
- `vpc` (VPC) inside `region`.
- `az1` (Availability Zone 1) inside `vpc`.
- `sub1` (Private subnet 1) inside `az1`.
- `worker1` (Worker 1) inside `sub1`.
- `az2` (Availability Zone 2) inside `vpc`.
- `sub2` (Private subnet 2) inside `az2`.
- `worker2` (Worker 2) inside `sub2`.
- `s3_out` (Output bucket) inside `region`.
- `status` (Job status) inside `region`.
- `done` (Completion topic) inside `region`.
- `cdn` (CloudFront) inside `region`.

## Inferred decisions and exclusions

- Operations is one actor outside AWS who inspects the DLQ and DynamoDB and receives SNS notifications.
- Region boundary added because one region was requested.
- Automatic layout, left-to-right; no manual coordinates.
