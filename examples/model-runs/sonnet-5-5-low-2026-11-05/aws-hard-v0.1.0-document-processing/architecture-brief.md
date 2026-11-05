# Architecture brief

## Goal
AWS (`aws` grammar) document processing pipeline: intake via API Gateway and Lambda, queued jobs processed by two Fargate workers, results served through CloudFront.

## Explicit requirements
- Document client and operations user outside AWS.
- API Gateway -> Lambda intake handler; Lambda stores originals in input S3 and queues jobs in SQS.
- Two Fargate workers (one per AZ, private subnets of one VPC) consume the jobs queue; each reads input S3, writes output S3, updates DynamoDB, publishes to SNS.
- Client downloads via client -> CloudFront -> output S3.
- Failed jobs go to a DLQ after max attempts; operations inspects the DLQ and DynamoDB and redrives DLQ -> jobs queue.
- SNS notifies operations.
- One cloud, one region, one VPC, two AZs, one private subnet per AZ; no other services.

## Relationships and containment
- Cloud > Region > VPC > AZ A / AZ B > private subnet > worker.
- API Gateway, Lambda, S3, SQS, DynamoDB, SNS, CloudFront are regional services outside the VPC.

## Inferred decisions and exclusions
- Lambda is not placed in the VPC (not requested).
- No NAT, VPC endpoints, WAF, monitoring or other services added.
