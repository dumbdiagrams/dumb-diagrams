# Reference specification

Create `AWS image thumbnail pipeline` with AWS grammar and left-to-right flow.

## Entities and containment

- Generic client `uploader`, label `Image uploader`, outside AWS.
- AWS cloud `aws_cloud`, label `AWS Cloud`.
- Logical boundary `image_pipeline`, label `Image processing pipeline`, inside AWS Cloud.
- API Gateway `upload_api`, label `Upload API`, inside the pipeline.
- Lambda `intake`, label `Upload handler`, inside the pipeline.
- S3 `originals`, label `Original images`, inside the pipeline.
- SQS `jobs`, label `Thumbnail jobs`, inside the pipeline.
- Lambda `processor`, label `Thumbnail processor`, inside the pipeline.
- S3 `thumbnails`, label `Generated thumbnails`, inside the pipeline.
- CloudFront `delivery`, label `Image delivery`, inside the pipeline.

## Directed connections

- `uploader` → `upload_api`, label `upload request`.
- `upload_api` → `intake`, label `validate upload`.
- `intake` → `originals`, label `save original`.
- `intake` → `jobs`, label `queue thumbnail job`.
- `jobs` → `processor`, label `process image`.
- `processor` → `thumbnails`, label `write thumbnail`.
- `originals` → `delivery`, label `original image`.
- `thumbnails` → `delivery`, label `thumbnail`.

No other entities or connections are part of this example.
