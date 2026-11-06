# Architecture brief

## Goal

Create a document intake and processing architecture with client submission and CloudFront downloads; two Fargate workers in private subnets across two Availability Zones; managed storage, queues, status, and notifications; and DLQ inspection/redrive.

## Explicit requirements

- The client submits documents through API Gateway to a Lambda intake handler, which stores originals in input S3 and queues work in SQS.
- Two Fargate workers in two AZs, each in a private subnet of one VPC, consume the jobs queue; each reads input S3, writes processed files to output S3, updates DynamoDB status, and publishes completion to SNS.
- The client downloads through CloudFront, with request direction client → CloudFront → output S3 origin.
- After maximum attempts, failed jobs move to a DLQ. An operations user inspects the DLQ and DynamoDB and can redrive messages from the DLQ to the jobs queue. SNS sends completion notifications to operations.
- Show one cloud, one region, one VPC, two AZs, one private subnet group per AZ; clients outside AWS; managed services outside the VPC; no other services.

## Relationships and containment

- API request: client → API Gateway → Lambda intake.
- Intake writes original files to input S3 and enqueues jobs.
- Jobs queue and input S3 each feed both workers; each worker writes to output S3, updates DynamoDB, and publishes to SNS.
- Client download request: client → CloudFront → output S3 origin.
- Jobs queue failure path → DLQ after the retry limit; operations inspects DLQ and DynamoDB and triggers a DLQ → jobs queue redrive; SNS → operations.
- The cloud contains one region, which contains a VPC with two AZs and one private subnet group in each; one Fargate worker is inside each private subnet. The other managed services are in the region outside the VPC. Both clients are outside AWS.

## Inferred decisions and exclusions

- The two explicitly requested Fargate workers are represented as separate resources and assigned one per AZ.
- The AWS provider guide treats these named managed AWS services as outside the VPC; Lambda intake and the services are placed at region scope.
- Ops inspections and redrive are rendered as dashed peer interactions; the retry-limit transition is a dashed failure connector.
