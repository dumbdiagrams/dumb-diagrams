# Architecture brief

## Goal

Show an AWS document intake, asynchronous processing, output delivery, and operations recovery architecture.

## Explicit requirements

- One AWS cloud and region, one VPC, two Availability Zones, and one private subnet group in each AZ.
- External document client submits through API Gateway to Lambda; Lambda stores source documents in input S3 and enqueues SQS jobs.
- Two Fargate workers consume jobs, each placed in a different AZ's private subnet. Both read input S3, write output S3, update DynamoDB status, and publish completion to SNS.
- Client downloads through CloudFront, which fetches from output S3.
- Jobs exceeding maximum attempts go to a DLQ. Operations inspects DLQ and DynamoDB, and redrives DLQ messages to the jobs queue. SNS notifies operations of completion.
- Managed AWS services remain outside the VPC; clients remain outside AWS.

## Relationships and containment

The AWS cloud contains the region, VPC, and regional managed services. The VPC contains two AZs, each with a private subnet group containing one Fargate worker. API Gateway, Lambda, S3 buckets, SQS queues, SNS, and DynamoDB are outside the VPC; CloudFront is shown at the AWS cloud scope outside the region; the delivery arrow points from CloudFront to the output S3 origin. The external client submits documents through the intake path and downloads via CloudFront; operations inspects the DLQ and status table and receives SNS notifications. DLQ redrive points back to the jobs queue.

## Inferred decisions and exclusions

- Represent the two Fargate workers as separate ECS resources to make the requested per-AZ placement explicit.
- Represent CloudFront's origin fetch as output S3 to CloudFront, preserving origin-fetch direction; client delivery is CloudFront to client.
- No additional services, networking components, or security/monitoring components are included.
