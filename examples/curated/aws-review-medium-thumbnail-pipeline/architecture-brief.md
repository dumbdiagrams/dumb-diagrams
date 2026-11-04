# Architecture brief

## Intent and explicit requirements

- Provider: AWS.
- Workload: accept image uploads, retain originals, create thumbnails asynchronously, and deliver both image variants.
- Keep the intake path and asynchronous processing path visible.

## Normalized components

- A generic image uploader outside AWS.
- An AWS Cloud boundary and an `Image processing pipeline` logical boundary.
- API Gateway and an upload Lambda for intake.
- S3 for original images, SQS for thumbnail jobs, a processing Lambda, and S3 for generated thumbnails.
- CloudFront for delivery of both image variants.

## Directed relationships

- Uploader → upload API → upload handler.
- Upload handler branches to original-image storage and the job queue.
- Queue → thumbnail processor → thumbnail storage.
- Original and thumbnail storage both feed image delivery.

## Placement and exclusions

- Keep AWS resources inside AWS Cloud and the pipeline boundary.
- Do not add user identity, databases, analytics, or monitoring.
- Use left-to-right automatic layout without fixed positions or routes.
