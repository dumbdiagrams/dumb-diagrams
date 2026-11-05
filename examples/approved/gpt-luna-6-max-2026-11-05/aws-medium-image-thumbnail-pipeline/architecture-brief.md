# Architecture brief

## Goal

Create an AWS pipeline in which an uploader submits images through an API, originals are stored, thumbnail work is queued and processed, and a content delivery service serves both image variants.

## Explicit requirements

- An uploader submits an image through an API.
- An upload handler stores the original and queues a thumbnail job.
- A processor creates a thumbnail.
- A content delivery service serves original and thumbnail images.

## Relationships and containment

- Uploader → API Gateway → Lambda upload handler.
- Upload handler stores the original in the image bucket and queues work in SQS; the queue invokes a Lambda thumbnail processor; the processor writes the thumbnail to the image bucket.
- CloudFront fetches the original or thumbnail from the image bucket and serves the images to the uploader/viewer.

## Inferred decisions and exclusions

- Use one S3 bucket for original and thumbnail objects because the request describes a single original store and does not request a separate output bucket.
- API Gateway is the API entry point and Lambda represents the named upload handler and thumbnail processor.
