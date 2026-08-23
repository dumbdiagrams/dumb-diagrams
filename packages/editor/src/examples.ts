import awsHighAvailabilityWebAppSource from "../../../examples/src/aws-high-availability-web-app.dgm?raw";
import awsDataTransferHubSource from "../../../examples/src/aws-data-transfer-hub.dgm?raw";
import bedrockClaimsProcessingSource from "../../../examples/src/bedrock-claims-processing.dgm?raw";

const DATA_TRANSFER_HUB_PROMPT = `Create a diagram titled "AWS Data Transfer Hub" using the AWS grammar and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

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

Use orthogonal connectors with separate lanes. Every connector must be a single simple path from its source to its target: no self-intersections, retraced segments, loops, overshoots, or dangling dead-end legs. Prefer short straight connections whenever nodes align.`;

const HIGH_AVAILABILITY_PROMPT = `Create a diagram titled "Highly available AWS web application" using the AWS grammar and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

Composition and hierarchy:
- Put a generic Web client outside the AWS Cloud on the far left.
- Inside the AWS Cloud, add a "Frontend services" group containing, in traffic order, Route 53, Cognito labelled "User authentication", CloudFront, and an S3 bucket labelled "Static content".
- Place API Gateway between the frontend group and the VPC.
- Create one VPC containing an Application Load Balancer followed by two stacked availability zones: "Availability Zone A" and "Availability Zone B".
- In each availability zone, put a "Private application subnet" beside a "Private database subnet". Each application subnet contains an ECS service and a secondary Fargate-tasks resource. Each database subnet contains a resource labelled "DynamoDB table".
- Add a "Shared platform services" group inside the AWS Cloud but outside the VPC, containing ECR labelled "Container images" and CloudWatch labelled "Application + database monitoring".

Main request flow and numbered stages:
1. Web client to Route 53, entering Route 53 from the west; put badge 1 on this connection.
2. Route 53 to Cognito; put badge 2 on this connection.
3. Cognito to CloudFront; put badge 3 on this connection.
- CloudFront to the static-content S3 bucket, labelled "static content".
4. CloudFront to API Gateway; put badge 4 on this connection.
- Cognito to API Gateway with a dashed peer connection labelled "JWT authorizer". Keep this route visibly separate from the solid request path.
5. API Gateway to the Application Load Balancer; put badge 5 on this connection.
6. The load balancer fans out to the ECS service in both availability zones; put badge 6 on the Availability Zone A branch.
- In each application subnet, connect ECS to its Fargate tasks with a dashed peer connection.
- In each availability zone, connect Fargate tasks to that zone's DynamoDB.
- Connect ECR to the Fargate tasks in both zones using dashed connections; label the Availability Zone A connection "container image".
- Connect both Fargate resources and both DynamoDB resources to CloudWatch using dashed peer connections.

Keep the frontend, VPC, both availability zones, and subnet boundaries easy to scan. Use compact orthogonal routing, reserve a distinct lane for every connector, prefer straight connections when source and target align, and never overlap solid and dashed routes.`;

const BEDROCK_CLAIMS_PROMPT = `Create a diagram titled "Claims processing with Amazon Bedrock" using the AWS grammar and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

Composition and hierarchy:
- Put a generic Claims analyst actor outside the AWS Cloud at the upper left and a generic Web client outside the cloud at the lower left.
- Inside the AWS Cloud, create one Region boundary with two wide horizontal bands.
- The upper band is a logical group titled "Blueprints Creation". It contains an S3 resource labelled "Sample documents bucket" followed by a Bedrock resource labelled "Data Automation · Blueprints generation". Put group badge 3 near this band's upper-right area.
- The lower band is a logical group titled "Claims Processing". Start with an S3 resource labelled "Claims document bucket".
- Inside Claims Processing, add an account-style workflow boundary titled "AWS Step Functions Workflow · Claims Processing". It contains, from left to right: a Bedrock resource labelled "Data Automation · Multimodal extraction", a SageMaker resource labelled "AI · Fraud detection model", a DynamoDB resource labelled "Claims processing state", and a Bedrock resource labelled "Nova Pro/Lite · Insights generation". Put group badge 5 near the workflow boundary's upper-right area.
- Place Simple Notification Service to the right of the workflow but still inside Claims Processing. Put group badge 9 near the Claims Processing boundary's upper-right area.
- Place a Simple Notification Service Email Notification resource below the claims-processing band but still inside the Region, labelled "Email notification".

Connections and numbered stages:
1. Claims analyst to the sample-documents S3 bucket; put badge 1 on this connection.
2. Sample-documents S3 to Bedrock blueprint generation; put badge 2 on this connection.
4. Web client to the claims-document S3 bucket; put badge 4 on this connection.
- Claims-document S3 to Bedrock multimodal extraction.
6. Claims-document S3 directly to DynamoDB claims-processing state; put badge 6 on this connection.
7. Bedrock multimodal extraction to SageMaker fraud detection; put badge 7 on this connection.
- SageMaker fraud detection to DynamoDB claims-processing state.
8. DynamoDB claims-processing state to Bedrock Nova Pro/Lite; put badge 8 on this connection.
- Bedrock Nova Pro/Lite to Simple Notification Service.
9. Simple Notification Service straight down to the email-notification resource; put badge 9 on this vertical connection.
- Email notification returns to the Web client through a separate lower outer lane.

Keep both bands wide and compact, with the blueprint flow above the claims flow. Use orthogonal connectors, give every independent connection its own lane, keep the SNS-to-email connection perfectly straight, and do not let connector segments overlap resources, labels, group borders, or one another.`;

export interface DiagramExample {
  id: string;
  title: string;
  description: string;
  tags: string[];
  source: string;
  prompt: string;
}

export const DIAGRAM_EXAMPLES: DiagramExample[] = [
  {
    id: "bedrock-claims-processing",
    title: "Claims processing with Amazon Bedrock",
    description: "A claims workflow that combines S3 document intake, Bedrock Data Automation, SageMaker fraud detection, DynamoDB state, Nova insights, and email notification.",
    tags: ["AWS", "Bedrock", "claims", "AI"],
    source: bedrockClaimsProcessingSource,
    prompt: BEDROCK_CLAIMS_PROMPT,
  },
  {
    id: "aws-data-transfer-hub",
    title: "AWS Data Transfer Hub",
    description: "A compact cross-account deployment flow for UI hosting, authentication, workflow automation, replication templates, and Fargate workloads.",
    tags: ["AWS", "cross-account", "Fargate", "replication"],
    source: awsDataTransferHubSource,
    prompt: DATA_TRANSFER_HUB_PROMPT,
  },
  {
    id: "aws-high-availability-web-app",
    title: "Highly available AWS web application",
    description: "A multi-AZ web application with CloudFront, API Gateway, ECS on Fargate, DynamoDB, ECR, and CloudWatch.",
    tags: ["AWS", "high availability", "multi-AZ"],
    source: awsHighAvailabilityWebAppSource,
    prompt: HIGH_AVAILABILITY_PROMPT,
  },
];
