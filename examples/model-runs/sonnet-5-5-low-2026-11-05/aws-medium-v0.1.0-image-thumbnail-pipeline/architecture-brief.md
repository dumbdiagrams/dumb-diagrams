# Architecture brief

## Goal
AWS (grammar `aws`) image thumbnail pipeline: an uploader submits images through an API, a handler stores originals and queues thumbnail jobs, a processor creates thumbnails, and a CDN serves originals and thumbnails.

## Explicit requirements
- Uploader submits an image through an API.
- Upload handler stores the original and queues a thumbnail job.
- Processor creates a thumbnail.
- Content delivery service serves both original and thumbnail images.

## Relationships and containment
- uploader -> api -> upload handler -> original storage; upload handler -> queue -> processor -> thumbnail storage.
- CDN reads original and thumbnail storage; CDN serves the uploader.
- Everything except the uploader is inside the AWS cloud.

## Inferred decisions and exclusions
- API Gateway as the API, Lambda for handler and processor, SQS as queue, S3 buckets for originals and thumbnails, CloudFront as CDN.
- Processor reads the original from the original bucket (needed to create a thumbnail).
- No WAF, DNS, monitoring, identity, or VPC.
