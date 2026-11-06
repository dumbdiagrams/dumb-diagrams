# Architecture brief

## Goal
Process submitted documents with an intake Lambda and two Fargate workers, preserving the specified S3, queue, status, notification, download, and operations paths.

## Explicit requirements
- One AWS Cloud, one region, one VPC, two AZs, and one private subnet group in each AZ. Two Fargate workers, one per AZ/private subnet.
- API Gateway → Lambda intake; intake stores originals in input S3 and queues jobs in SQS. Each worker consumes jobs, reads input S3, writes output S3, updates DynamoDB, and publishes completion to SNS.
- Failed jobs move to a DLQ after maximum attempts. Operations inspects DLQ and DynamoDB and redrives from DLQ to jobs. SNS notifies operations. Client download path is client → CloudFront → output S3.
- Clients outside AWS; managed services outside VPC; no other services.

## Relationships and containment
- AWS services and network groups reside within the single cloud/region. The VPC contains two AZs, each with one private subnet and its Fargate worker. Managed services remain outside the VPC. Client and operations user remain outside AWS.
- Every worker has separate queue-consumption, input-read, output-write, status-update, and completion-publish edges. DLQ redrive and notification/inspection edges are explicit.

## Inferred decisions and exclusions
- Fargate is modeled as the named worker runtime. The workers are individually represented in AZ-specific subnets. No cluster, load balancer, NAT, IAM, or other unrequested service is added.
