Create a diagram titled "AWS Data Transfer Hub" using the AWS grammar and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

Match this compact two-account composition:
- Put a generic User actor outside the AWS Cloud on the left.
- Inside the cloud, put a large "Customer's AWS Account" on the left and a narrower "AWS Managed Account" on the right. Keep their heights similar and avoid turning the architecture into one long horizontal strip.
- Arrange the customer account as a compact three-row serpentine flow. The bottom row starts with a "Public web UI" group, then AppSync, then an API Lambda. The workflow occupies the right side and leads down toward Fargate. Authentication sits in the upper-left area and DynamoDB sits above the main API flow.
- The Public web UI group contains a client labelled "Data Transfer Hub UI", CloudFront labelled "Amazon CloudFront", and an S3 bucket labelled "Static web assets".
- The Authentication group contains Cognito labelled "Amazon Cognito" beside an identity labelled "OpenID Connect". They are alternative authentication choices, not a chain; do not connect Cognito to OpenID Connect.
- Add DynamoDB labelled "Data transfer task information".
- Add a logical boundary titled "AWS Step Functions workflow" containing a Workflow Lambda followed by CloudFormation labelled "Plugin deployment". The boundary represents Step Functions, so do not add a redundant Step Functions resource icon.
- Add an "Application workloads" group containing Fargate labelled "Plugin transfer tasks".
- Arrange the managed account as a compact two-column by three-row inventory: S3 and DynamoDB replication component templates; a centralized plugin-template S3 bucket and an ECR replication component template; then ECR container images and an ECR replication Docker image.

Connections and numbered stages:
1. User exits south and enters the west side of Data Transfer Hub UI. UI to CloudFront with badge 1, then CloudFront to the static-web-assets S3 bucket.
2. UI exits north and enters the west side of AppSync with badge 2.
3. UI exits north toward both authentication alternatives. Enter the south side of Cognito with a dashed peer connection and badge 3; enter the south side of OpenID Connect with a separate dashed peer connection and no duplicate badge.
4. AppSync to API Lambda with badge 4.
5. API Lambda to Workflow Lambda with badge 5, then Workflow Lambda to CloudFormation. Exit CloudFormation south and enter Fargate from the north so this workflow leg stays short and vertical.
6. Centralized plugin-template S3 to CloudFormation with badge 6.
7. ECR container images to Fargate with badge 7.
8. AppSync to DynamoDB task information with badge 8.

Use orthogonal connectors with separate lanes. Every connector must be a single simple path from its source to its target: no self-intersections, retraced segments, loops, overshoots, or dangling dead-end legs. Prefer short straight connections whenever nodes align.
