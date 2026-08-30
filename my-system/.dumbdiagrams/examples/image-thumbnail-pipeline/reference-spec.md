Create a diagram titled "Image thumbnail pipeline" using the AWS grammar and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

Composition and hierarchy:
- Put a generic Image uploader outside the AWS Cloud on the far left.
- Inside the AWS Cloud, create a group titled "Upload experience" containing CloudFront labelled "Web delivery" and an S3 bucket labelled "Upload UI".
- Create a group titled "Upload storage" containing an S3 bucket labelled "Original images".
- Create a group titled "Processing" containing a Lambda labelled "Thumbnail processor".
- Create a group titled "Processed assets" containing an S3 bucket labelled "Thumbnail images" and a DynamoDB resource labelled "Image metadata".
- Place Upload storage below the Upload experience. Place Processing and Processed assets to the right.
- Do not add an API Gateway, queue, database other than the metadata table, or notification service.

Connections and numbered stages:
1. Image uploader to CloudFront; put badge 1 on this connection.
2. CloudFront to the Upload UI S3 bucket; label this connection "static content".
3. Image uploader directly to the Original images S3 bucket; label this connection "direct multipart upload".
4. Original images to the Thumbnail processor Lambda; put badge 2 on this connection and use a dashed event connection labelled "object-created event".
5. Thumbnail processor to the Thumbnail images S3 bucket; put badge 3 on this connection.
6. Thumbnail processor to Image metadata DynamoDB; put badge 4 on this connection.

Keep the direct upload path visibly separate from the static web-delivery path. Keep the bucket-to-Lambda event path short and clearly asynchronous.

Use orthogonal connectors with separate lanes. Every connector must be a single simple path from source to target: no self-intersections, retraced segments, loops, overshoots, or dangling dead-end legs. Prefer short straight connections whenever nodes align. Keep group boundaries readable and do not let connectors overlap resources, labels, group borders, or one another.
