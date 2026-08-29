# Architecture brief

## Goal

Represent an AWS report-generation service whose synchronous request path hands
work to an asynchronous queue and worker pipeline.

## Explicit requirements

- A web client reaches CloudFront and an S3-hosted report UI.
- CloudFront also exposes the report API through API Gateway and a Lambda
  request handler.
- The handler enqueues report jobs in SQS; failed jobs go to a dead-letter SQS
  queue.
- A Fargate worker consumes jobs, stores generated reports in S3, and records
  job status in DynamoDB.
- The worker publishes report notifications through SNS to an email
  notification.

## Components, flows, and containment

- Use `Frontend services`, `Report API`, `Async Queue Tier`, `Worker Tier`, and
  `Storage Tier` boundaries inside AWS Cloud.
- Web client → CloudFront → report UI S3 and CloudFront → API Gateway → report
  handler Lambda.
- Report handler → report-jobs SQS → report worker Fargate.
- Report jobs → dead-letter queue through a dashed failure path.
- Worker → generated-reports S3, job-status DynamoDB, and report-notifications
  SNS → email notification.

## Inferred decisions and exclusions

- The queue, worker, storage, and notification boundaries are inferred scopes
  for the explicitly requested asynchronous stages.
- The dead-letter path is failure handling, not a second normal processing
  path.
- Do not add authentication, VPC networking, WAF, Route 53, CloudWatch,
  Step Functions, or other unrequested services.
- Keep the synchronous request path distinguishable from the asynchronous
  worker path; choose layout only after the flow semantics are established.
