# AWS conventions (First-class)

AWS is the first-class provider. Use the current AWS catalog and conventions
below; the other provider guides are experimental adaptations for now.

Use canonical `aws.*` types from `../catalog.md` or `../catalog.json` and obey
each entry's allowed parent boundaries. Use `aws.cloud` for the AWS scope shown
by the diagram and add account, region, VPC, availability-zone, or subnet
boundaries only when explicit, strongly implied, or necessary to communicate
placement. Use `cloud-agnostic.boundary` for logical application groupings.

Preserve explicitly named AWS services and public/private or runtime placement.
For an underspecified highly available design, infer only the multiplicity and
multi-zone structure needed to make the named workload meaningfully highly
available. Do not turn that phrase into a blanket security, networking,
observability, DNS, backup, or governance stack.

Typical relationships—such as an ALB invoking an ECS service, Lambda consuming
an event, or an application using a database—may help fill an obvious missing
main flow. They are not permission to add ALB, API Gateway, queues, caches,
NAT gateways, Route 53, WAF, CloudWatch, Secrets Manager, CloudTrail,
GuardDuty, or any other service absent a request, strong implication,
structural requirement, or coherence need.

Represent availability zones, subnets, replicas, and repeated compute instances
only to the level relevant to the request. Do not invent regions, CIDRs,
protocols, labels, or counts. Resolve AWS architecture semantics first, then use
the common layout rules in `../dgm.md`.

Draw regional managed services (DynamoDB, S3, SQS, SNS, CloudFront, Route 53,
API Gateway, Cognito, EventBridge, CloudWatch) outside the VPC; validation
warns with `managed-service-in-network` when one is inside it.
