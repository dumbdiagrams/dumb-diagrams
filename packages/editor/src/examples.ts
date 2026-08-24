import awsHighAvailabilityWebAppSource from "../../../examples/diagrams/aws-high-availability-web-app.dgm?raw";
import awsDataTransferHubSource from "../../../examples/diagrams/aws-data-transfer-hub.dgm?raw";
import bedrockClaimsProcessingSource from "../../../examples/diagrams/bedrock-claims-processing.dgm?raw";

import DATA_TRANSFER_HUB_PROMPT from "../../../examples/prompts/aws-data-transfer-hub.md?raw";
import HIGH_AVAILABILITY_PROMPT from "../../../examples/prompts/aws-high-availability-web-app.md?raw";
import BEDROCK_CLAIMS_PROMPT from "../../../examples/prompts/bedrock-claims-processing.md?raw";

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
