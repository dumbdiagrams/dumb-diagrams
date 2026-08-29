# Architecture brief

## Goal

Provide a small serverless image-upload and thumbnail-processing pipeline on
AWS, with a browser upload experience and a durable metadata record.

## Explicit requirements

- Serve the upload UI through CloudFront from an S3 bucket.
- Let the image uploader upload original images directly to a separate S3
  bucket.
- An object-created event triggers Lambda to generate a thumbnail.
- Store thumbnails in another S3 bucket and image metadata in DynamoDB.

## Components and relationships

- A generic image uploader outside AWS.
- AWS Cloud containing an `Upload experience` boundary with CloudFront and the
  upload UI S3 bucket.
- Separate `Upload storage`, `Processing`, and `Processed assets` boundaries.
- Image uploader → CloudFront → upload UI S3 for the web experience.
- Image uploader → original-images S3 for direct multipart upload.
- Original-images S3 → thumbnail processor Lambda through a dashed
  object-created event.
- Lambda → thumbnail-images S3 and Lambda → image-metadata DynamoDB.

## Inferred decisions and exclusions

- The AWS Cloud and four logical boundaries are composition boundaries inferred
  to make the requested stages legible.
- The event-driven S3-to-Lambda trigger is inferred from “when a new image
  arrives”.
- Keep this pipeline focused: do not add API Gateway, queues, databases other
  than the metadata table, notifications, Cognito, WAF, Route 53, CloudWatch,
  Step Functions, or a VPC.
- Choose a readable flow and separate the direct-upload and web-delivery paths
  after the architecture semantics are fixed.
