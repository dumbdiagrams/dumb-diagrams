# Architecture brief

## Goal

AWS image upload, queued thumbnail generation, and CDN delivery of originals and thumbnails. Provider/grammar: `aws`.

## Explicit requirements

- An uploader submits an image through an API; the upload handler stores the original and queues a thumbnail job; a processor creates a thumbnail; a content delivery service serves both original and thumbnail images.

## Relationships and containment

- `uploader` → `api`: Submit image.
- `api` → `handler`: Invoke.
- `handler` → `images`: Store original.
- `handler` → `jobs`: Queue job.
- `jobs` → `processor`: Thumbnail job.
- `processor` → `images`: Read original, write thumbnail (bidirectional).
- `cdn` → `images`: Serve original and thumbnail.

- `uploader` (Uploader) at root, outside any boundary.
- `aws` (AWS Cloud) at root, outside any boundary.
- `cdn` (CDN) inside `aws`.
- `api` (Upload API) inside `aws`.
- `handler` (Upload handler) inside `aws`.
- `jobs` (Thumbnail jobs) inside `aws`.
- `processor` (Thumbnail processor) inside `aws`.
- `images` (Image bucket) inside `aws`.

## Inferred decisions and exclusions

- One S3 bucket holds originals and thumbnails (storage unspecified); a single bucket keeps the CDN origin unambiguous.
- Queue is SQS and compute is Lambda, the conventional fit for 'queue' and 'handler/processor'.
- No viewer actor is drawn because the request names none.
- Automatic layout, left-to-right; no manual coordinates.
