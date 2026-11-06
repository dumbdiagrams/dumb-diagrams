# Architecture brief

## Goal

Create a simple AWS static website delivery architecture.

## Explicit requirements

- Show a website visitor, DNS, a content delivery service, and a bucket storing website files.

## Relationships and containment

- Visitor requests DNS, DNS directs the request to content delivery, and content delivery fetches website files from the bucket.
- AWS services are contained in AWS Cloud and grouped as website delivery; the visitor is external.

## Inferred decisions and exclusions

- Route 53, CloudFront, and S3 represent the requested DNS, content delivery service, and file bucket. No extra stages or services are added.
