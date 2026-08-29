Create a diagram titled "Simple serverless web application" using the AWS grammar and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

Composition and hierarchy:
- Put a generic Web client outside the AWS Cloud on the far left.
- Inside the AWS Cloud, create a group titled "Frontend services" containing CloudFront labelled "Web delivery" and an S3 bucket labelled "Static web assets".
- Place API Gateway to the right of the frontend group.
- Place a Lambda resource labelled "Request handler" to the right of API Gateway.
- Place a DynamoDB resource labelled "Application data" to the right of the Lambda.
- Do not add authentication, queues, caching, monitoring, VPCs, or other resources.

Connections and numbered stages:
1. Web client to CloudFront; put badge 1 on this connection.
2. CloudFront to the Static web assets S3 bucket; label this connection "static content".
3. CloudFront to API Gateway; put badge 2 on this connection.
4. API Gateway to the Request handler Lambda; put badge 3 on this connection.
5. Request handler Lambda to Application data DynamoDB; put badge 4 on this connection.

Keep the frontend group compact, place the database below or to the right of the application path, and avoid turning the diagram into a long thin strip.

Use orthogonal connectors with separate lanes. Every connector must be a single simple path from source to target: no self-intersections, retraced segments, loops, overshoots, or dangling dead-end legs. Prefer short straight connections whenever nodes align. Keep group boundaries readable and do not let connectors overlap resources, labels, group borders, or one another.
