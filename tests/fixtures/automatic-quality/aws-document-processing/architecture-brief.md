# Architecture brief

## Goal

Create a single-region AWS document processing architecture with two private Fargate workers, DLQ recovery, and CloudFront output delivery.

## Explicit requirements

- The client submits documents through API Gateway to a Lambda intake handler; intake stores originals in an input S3 bucket and queues jobs in SQS.
- Exactly two Fargate workers run in separate AZs, each in a private subnet group in one VPC. Each worker reads input S3, writes processed files to output S3, updates DynamoDB status, and publishes completion to SNS.
- The client downloads through CloudFront, with request flow client → CloudFront → output S3 origin.
- Failed jobs move to a DLQ after the maximum attempts. Operations inspects the DLQ and DynamoDB and can redrive DLQ messages to the jobs queue. SNS notifies operations of completion.
- Keep clients outside AWS and managed services outside the VPC. Show exactly one cloud, one region, one VPC, two AZs, and one private subnet group per AZ. Add no other services.

## Relationships and containment

- AWS Cloud contains one region. The region contains one VPC with AZ A and AZ B; each AZ contains its private subnet group and one worker. All other named AWS managed services are in the region outside the VPC.
- Client and operations user are outside AWS Cloud. Directed paths include intake, parallel workers, success outputs/status/notifications, retry failure to DLQ, operations inspection/redrive, and client download through CloudFront to output S3.

## Inferred decisions and exclusions

- API Gateway, Lambda, S3, SQS, Fargate, DynamoDB, SNS, and CloudFront directly map to the named services and roles. One worker is placed in each of the two requested AZs to fulfill the two-worker placement requirement. No unnamed supporting services are added.
