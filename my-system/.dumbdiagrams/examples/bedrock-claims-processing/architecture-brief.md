# Architecture brief

## Goal

Show an AWS claims-processing application with a separate blueprint-creation
path above the main document-processing workflow.

## Explicit requirements

- A claims analyst uploads sample documents to S3 for Bedrock Data Automation
  blueprint generation.
- A web client uploads claim documents to a separate S3 bucket.
- The claims workflow uses Bedrock Data Automation for multimodal extraction,
  SageMaker AI for fraud detection, DynamoDB for processing state, and Bedrock
  Nova Pro/Lite for insight generation.
- Step Functions orchestrates the claims-processing workflow.
- Notify the analyst by email after processing completes.

## Relationships and containment

- Claims analyst → sample-documents S3 → Bedrock Data Automation blueprint
  generation.
- Web client → claims-documents S3 → multimodal extraction → fraud model →
  claims state → Nova insights → SNS → email notification.
- Claims-documents S3 also writes directly to the claims-processing state.
- Keep the workflow services inside an `AWS Step Functions Workflow · Claims
  Processing` boundary, the blueprint path in `Blueprints Creation`, and both
  inside a Region within AWS Cloud.

## Inferred decisions and exclusions

- The Region, two processing bands, workflow boundary, and SNS-to-email
  notification path are structural groupings inferred from the requested
  stages.
- The blueprint-creation path is separate from, but related to, the main claims
  flow; do not collapse it into the runtime workflow.
- Do not infer unrelated queues, API gateways, authentication, VPC networking,
  WAF, Route 53, or monitoring services.
- Preserve distinct analyst and web-client actors and keep the email return path
  readable after the semantics are fixed.
