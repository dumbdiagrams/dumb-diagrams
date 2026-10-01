# Architecture brief

## Goal

Show a highly available AWS web application with an edge/frontend path and a
two-availability-zone private backend.

## Explicit requirements

- Web client → Route 53 → Cognito → CloudFront, with static content in S3.
- CloudFront → API Gateway, and Cognito provides a separate JWT authorizer path
  to the API.
- API Gateway → Application Load Balancer in a VPC spanning two availability
  zones.
- Each zone contains a private application subnet, an ECS service, and
  secondary Fargate tasks. Two logically paired DynamoDB tables live in shared
  regional platform services outside the VPC, with one table associated with
  each zone's workload.
- ECR supplies container images; CloudWatch receives application and database
  monitoring data.

## Containment and relationships

- Frontend and shared platform services are inside AWS Cloud but outside the
  VPC.
- The ALB is in the VPC and fans out to both ECS services.
- Each ECS service peers with its zone's Fargate tasks; each Fargate resource
  reaches its paired DynamoDB table in shared platform services.
- ECR supplies both Fargate resources and both Fargate/DynamoDB pairs report to
  CloudWatch.
- Keep the two availability-zone structures equivalent and preserve private
  application-subnet containment. The DynamoDB tables are regional managed
  services outside the VPC, paired with the zones for the illustrated flow.

## Inferred decisions and exclusions

- Two zones, private application subnets, and logically paired workload/data
  structures directly implement the requested high availability.
- The frontend and shared-platform boundaries clarify scope; no additional
  AWS service is implied.
- Do not add NAT gateways, Aurora, queues, caches, WAF, Secrets Manager,
  CloudTrail, GuardDuty, or other services not requested.
- Determine readable flow and routing after these topology and dependency
  semantics are fixed.
