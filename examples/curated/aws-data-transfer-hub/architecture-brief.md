# Architecture brief

## Goal

Represent a cross-account AWS data-transfer platform with a customer-facing
control plane, plugin deployment workflow, and managed-account artefacts.

## Explicit requirements

- In the customer account, serve a public UI with CloudFront and S3.
- Offer Cognito and OpenID Connect as alternative authentication choices.
- Expose a GraphQL API through AppSync and retain transfer task information in
  DynamoDB.
- Use a Lambda-backed Step Functions workflow to deploy transfer plugins with
  CloudFormation.
- Run transfer workloads on Fargate.
- In a separate AWS-managed account, keep S3 and DynamoDB replication component
  templates, centralized S3 plugin templates, an ECR replication component
  template, plugin container images, and the ECR replication Docker image.

## Relationships and containment

- A generic user reaches the customer account's public UI, which uses
  CloudFront and S3 for static content.
- The UI reaches AppSync; AppSync reaches the API Lambda and the task-info
  DynamoDB resource.
- The UI can use Cognito or OpenID Connect; those alternatives are peers, not a
  chain.
- API Lambda → workflow Lambda → CloudFormation deployment.
- CloudFormation deployment → Fargate transfer tasks.
- Centralized plugin templates and ECR container images in the managed account
  support deployment and workloads respectively.
- Preserve the customer-account and AWS-managed-account boundaries.

## Inferred decisions and exclusions

- The account boundaries and the `Authentication`, `Public web UI`, `AWS Step
  Functions workflow`, and `Application workloads` boundaries make explicit the
  scopes implied by the request.
- Step Functions is represented by the workflow boundary; do not add a
  redundant Step Functions icon.
- No extra AWS best-practice services, queues, caches, WAF, VPC networking, or
  monitoring services are inferred.
- Use a compact readable flow for the UI, API, workflow, and workload stages;
  layout must not alter account scope or flow direction.
