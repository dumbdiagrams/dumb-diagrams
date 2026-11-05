# Architecture brief

## Goal

Create an AWS image thumbnail processing and delivery pipeline.

## Explicit requirements

- An uploader submits an image through an API.
- An upload handler stores the original and queues a thumbnail job.
- A processor creates a thumbnail.
- A content delivery service serves both original and thumbnail images.

## Relationships and containment

- Uploader → API Gateway → intake Lambda; intake Lambda → original S3 and thumbnail SQS; SQS → processor Lambda → thumbnail S3.
- Both original and thumbnail S3 stores supply the content delivery service. AWS services are grouped within AWS Cloud; the uploader is outside it.

## Inferred decisions and exclusions

- API Gateway, Lambda, S3, SQS, and CloudFront are the direct AWS mappings for the requested roles. No processing triggers beyond the queue-to-processor relationship are introduced.
