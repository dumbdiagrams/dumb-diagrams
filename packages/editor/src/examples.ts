import awsHighAvailabilityWebAppSource from "../../../examples/diagrams/aws-high-availability-web-app.dgm?raw";
import awsDataTransferHubSource from "../../../examples/diagrams/aws-data-transfer-hub.dgm?raw";
import bedrockClaimsProcessingSource from "../../../examples/diagrams/bedrock-claims-processing.dgm?raw";
import simpleServerlessWebApplicationSource from "../../../examples/diagrams/simple-serverless-web-application.dgm?raw";
import imageThumbnailPipelineSource from "../../../examples/diagrams/image-thumbnail-pipeline.dgm?raw";
import asynchronousReportGenerationSource from "../../../examples/diagrams/asynchronous-report-generation.dgm?raw";
import eventDrivenOrderFulfillmentSource from "../../../examples/diagrams/event-driven-order-fulfillment.dgm?raw";
import azurePrivateAppServiceSource from "../../../examples/diagrams/azure-private-app-service.dgm?raw";

import DATA_TRANSFER_HUB_PROMPT from "../../../examples/prompts/aws-data-transfer-hub.md?raw";
import HIGH_AVAILABILITY_PROMPT from "../../../examples/prompts/aws-high-availability-web-app.md?raw";
import BEDROCK_CLAIMS_PROMPT from "../../../examples/prompts/bedrock-claims-processing.md?raw";
import SIMPLE_SERVERLESS_WEB_APPLICATION_PROMPT from "../../../examples/prompts/simple-serverless-web-application.md?raw";
import IMAGE_THUMBNAIL_PIPELINE_PROMPT from "../../../examples/prompts/image-thumbnail-pipeline.md?raw";
import ASYNCHRONOUS_REPORT_GENERATION_PROMPT from "../../../examples/prompts/asynchronous-report-generation.md?raw";
import EVENT_DRIVEN_ORDER_FULFILLMENT_PROMPT from "../../../examples/prompts/event-driven-order-fulfillment.md?raw";
import AZURE_PRIVATE_APP_SERVICE_PROMPT from "../../../examples/prompts/azure-private-app-service.md?raw";

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
  {
    id: "simple-serverless-web-application",
    title: "Simple serverless web application",
    description: "A minimal serverless web path from a client through CloudFront and API Gateway to Lambda and DynamoDB.",
    tags: ["AWS", "serverless", "beginner"],
    source: simpleServerlessWebApplicationSource,
    prompt: SIMPLE_SERVERLESS_WEB_APPLICATION_PROMPT,
  },
  {
    id: "image-thumbnail-pipeline",
    title: "Image thumbnail pipeline",
    description: "A direct-upload image flow that uses an S3 event to invoke Lambda and persist thumbnails and metadata.",
    tags: ["AWS", "S3", "events"],
    source: imageThumbnailPipelineSource,
    prompt: IMAGE_THUMBNAIL_PIPELINE_PROMPT,
  },
  {
    id: "asynchronous-report-generation",
    title: "Asynchronous report generation",
    description: "An API-driven report workflow with SQS, a Fargate worker, storage, job status, and email notification.",
    tags: ["AWS", "async", "SQS"],
    source: asynchronousReportGenerationSource,
    prompt: ASYNCHRONOUS_REPORT_GENERATION_PROMPT,
  },
  {
    id: "event-driven-order-fulfillment",
    title: "Event-driven order fulfillment",
    description: "An order service that persists state and fans OrderCreated events out to inventory, payment, shipping, and notifications.",
    tags: ["AWS", "events", "fulfillment"],
    source: eventDrivenOrderFulfillmentSource,
    prompt: EVENT_DRIVEN_ORDER_FULFILLMENT_PROMPT,
  },
  {
    id: "azure-private-app-service",
    title: "Write-through caching with Azure Managed Redis",
    description: "An Azure App Service read path with Managed Redis cache-aside reads, Functions-coordinated write-through updates, SQL as the system of record, private endpoints, and Azure Monitor.",
    tags: ["Azure", "Managed Redis", "SQL Database", "write-through caching"],
    source: azurePrivateAppServiceSource,
    prompt: AZURE_PRIVATE_APP_SERVICE_PROMPT,
  },
];
