Create a diagram titled "Asynchronous report generation" using the AWS grammar and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

Composition and hierarchy:
- Put a generic Web client outside the AWS Cloud on the far left.
- Inside the AWS Cloud, create a group titled "Frontend services" containing CloudFront labelled "Web delivery" and an S3 bucket labelled "Report web UI".
- Place API Gateway to the right of the frontend group.
- Create a group titled "Report API" containing a Lambda labelled "Report request handler".
- Create a group titled "Async Queue Tier" containing SQS labelled "Report jobs" and a secondary SQS resource labelled "Dead-letter queue".
- Create a group titled "Worker Tier" containing Fargate labelled "Report worker".
- Create a group titled "Storage Tier" containing an S3 bucket labelled "Generated reports" and DynamoDB labelled "Job status".
- Add SNS labelled "Report notifications" and an Email Notification resource below the main processing flow.

Connections and numbered stages:
1. Web client to CloudFront; put badge 1 on this connection.
2. CloudFront to the Report web UI S3 bucket; label this connection "static content".
3. CloudFront to API Gateway; put badge 2 on this connection.
4. API Gateway to the Report request handler; put badge 3 on this connection.
5. Report request handler to Report jobs SQS; put badge 4 on this connection and label it "enqueue report".
6. Report jobs to Report worker; put badge 5 on this connection.
7. Report worker to Generated reports S3; put badge 6 on this connection.
8. Report worker to Job status DynamoDB; put badge 7 on this connection.
9. Report worker to Report notifications SNS; put badge 8 on this connection.
10. Report notifications SNS to Email Notification; put badge 9 on this connection.
- Report jobs to the Dead-letter queue using a dashed failure connection labelled "failed jobs".

Keep the synchronous request path across the upper row. Place the queue and worker tier below it, with storage and notifications to the right. Keep the dead-letter path short and visually distinct.

Use orthogonal connectors with separate lanes. Every connector must be a single simple path from source to target: no self-intersections, retraced segments, loops, overshoots, or dangling dead-end legs. Prefer short straight connections whenever nodes align. Keep group boundaries readable and do not let connectors overlap resources, labels, group borders, or one another.
