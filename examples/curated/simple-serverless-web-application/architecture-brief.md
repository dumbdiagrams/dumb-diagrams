# Architecture brief

## Intent and explicit requirements

- Provider: AWS.
- Workload: a simple serverless web application.
- User-facing roles: hosted frontend, API, request handler, and database.
- Keep the result focused on the main request/data flow.

## Normalized components

- A generic web client outside AWS.
- An AWS Cloud boundary.
- A logical `Frontend services` boundary.
- CloudFront for web delivery and S3 for static web assets.
- API Gateway for the application API.
- Lambda as the request handler.
- DynamoDB as the application data store.

The named AWS services and the two boundaries are inferred mappings from the
requested roles. They are the minimal conventional serverless structure chosen
for this pilot, not services explicitly named by the user.

## Directed relationships

- Web client → CloudFront.
- CloudFront → S3 static web assets for static content.
- CloudFront → API Gateway.
- API Gateway → Lambda request handler.
- Lambda request handler → DynamoDB application data.

## Placement, constraints, and exclusions

- CloudFront and S3 are contained by `Frontend services`; all AWS components
  are contained by the AWS Cloud.
- The web client remains outside AWS.
- Do not add authentication, queues, caching, monitoring, VPCs, DNS, WAF, or
  other resources.
- Use a readable left-to-right automatic layout only after these semantics are
  fixed; layout must not change the architecture.
