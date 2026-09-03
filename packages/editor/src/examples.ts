import awsHighAvailabilityWebAppSource from "../../../examples/curated/aws-high-availability-web-app/diagram.dgm?raw";
import awsDataTransferHubSource from "../../../examples/curated/aws-data-transfer-hub/diagram.dgm?raw";
import bedrockClaimsProcessingSource from "../../../examples/curated/bedrock-claims-processing/diagram.dgm?raw";
import simpleServerlessWebApplicationSource from "../../../examples/curated/simple-serverless-web-application/diagram.dgm?raw";
import imageThumbnailPipelineSource from "../../../examples/curated/image-thumbnail-pipeline/diagram.dgm?raw";
import asynchronousReportGenerationSource from "../../../examples/curated/asynchronous-report-generation/diagram.dgm?raw";
import azurePrivateAppServiceSource from "../../../examples/curated/azure-private-app-service/diagram.dgm?raw";
import cloudAgnosticOrderProcessingSource from "../../../examples/curated/cloud-agnostic-order-processing/diagram.dgm?raw";
import eventDrivenOrderFulfillmentSource from "../../../examples/curated/event-driven-order-fulfillment/diagram.dgm?raw";
import gcpStreamingAnalyticsSource from "../../../examples/curated/gcp-streaming-analytics/diagram.dgm?raw";

import DATA_TRANSFER_HUB_PROMPT from "../../../examples/curated/aws-data-transfer-hub/user-prompt.md?raw";
import HIGH_AVAILABILITY_PROMPT from "../../../examples/curated/aws-high-availability-web-app/user-prompt.md?raw";
import BEDROCK_CLAIMS_PROMPT from "../../../examples/curated/bedrock-claims-processing/user-prompt.md?raw";
import SIMPLE_SERVERLESS_WEB_APPLICATION_PROMPT from "../../../examples/curated/simple-serverless-web-application/user-prompt.md?raw";
import IMAGE_THUMBNAIL_PIPELINE_PROMPT from "../../../examples/curated/image-thumbnail-pipeline/user-prompt.md?raw";
import ASYNCHRONOUS_REPORT_GENERATION_PROMPT from "../../../examples/curated/asynchronous-report-generation/user-prompt.md?raw";
import AZURE_PRIVATE_APP_SERVICE_PROMPT from "../../../examples/curated/azure-private-app-service/user-prompt.md?raw";
import CLOUD_AGNOSTIC_ORDER_PROCESSING_PROMPT from "../../../examples/curated/cloud-agnostic-order-processing/user-prompt.md?raw";
import EVENT_DRIVEN_ORDER_FULFILLMENT_PROMPT from "../../../examples/curated/event-driven-order-fulfillment/user-prompt.md?raw";
import GCP_STREAMING_ANALYTICS_PROMPT from "../../../examples/curated/gcp-streaming-analytics/user-prompt.md?raw";

import DATA_TRANSFER_HUB_BRIEF from "../../../examples/curated/aws-data-transfer-hub/architecture-brief.md?raw";
import HIGH_AVAILABILITY_BRIEF from "../../../examples/curated/aws-high-availability-web-app/architecture-brief.md?raw";
import BEDROCK_CLAIMS_BRIEF from "../../../examples/curated/bedrock-claims-processing/architecture-brief.md?raw";
import SIMPLE_SERVERLESS_WEB_APPLICATION_BRIEF from "../../../examples/curated/simple-serverless-web-application/architecture-brief.md?raw";
import IMAGE_THUMBNAIL_PIPELINE_BRIEF from "../../../examples/curated/image-thumbnail-pipeline/architecture-brief.md?raw";
import ASYNCHRONOUS_REPORT_GENERATION_BRIEF from "../../../examples/curated/asynchronous-report-generation/architecture-brief.md?raw";
import AZURE_PRIVATE_APP_SERVICE_BRIEF from "../../../examples/curated/azure-private-app-service/architecture-brief.md?raw";
import CLOUD_AGNOSTIC_ORDER_PROCESSING_BRIEF from "../../../examples/curated/cloud-agnostic-order-processing/architecture-brief.md?raw";
import EVENT_DRIVEN_ORDER_FULFILLMENT_BRIEF from "../../../examples/curated/event-driven-order-fulfillment/architecture-brief.md?raw";
import GCP_STREAMING_ANALYTICS_BRIEF from "../../../examples/curated/gcp-streaming-analytics/architecture-brief.md?raw";

import DATA_TRANSFER_HUB_REFERENCE from "../../../examples/curated/aws-data-transfer-hub/reference-spec.md?raw";
import HIGH_AVAILABILITY_REFERENCE from "../../../examples/curated/aws-high-availability-web-app/reference-spec.md?raw";
import BEDROCK_CLAIMS_REFERENCE from "../../../examples/curated/bedrock-claims-processing/reference-spec.md?raw";
import SIMPLE_SERVERLESS_WEB_APPLICATION_REFERENCE from "../../../examples/curated/simple-serverless-web-application/reference-spec.md?raw";
import IMAGE_THUMBNAIL_PIPELINE_REFERENCE from "../../../examples/curated/image-thumbnail-pipeline/reference-spec.md?raw";
import ASYNCHRONOUS_REPORT_GENERATION_REFERENCE from "../../../examples/curated/asynchronous-report-generation/reference-spec.md?raw";
import AZURE_PRIVATE_APP_SERVICE_REFERENCE from "../../../examples/curated/azure-private-app-service/reference-spec.md?raw";
import CLOUD_AGNOSTIC_ORDER_PROCESSING_REFERENCE from "../../../examples/curated/cloud-agnostic-order-processing/reference-spec.md?raw";
import EVENT_DRIVEN_ORDER_FULFILLMENT_REFERENCE from "../../../examples/curated/event-driven-order-fulfillment/reference-spec.md?raw";
import GCP_STREAMING_ANALYTICS_REFERENCE from "../../../examples/curated/gcp-streaming-analytics/reference-spec.md?raw";

export interface DiagramExample {
  id: string;
  title: string;
  description: string;
  tags: string[];
  source: string;
  prompt: string;
  /** The normalized interpretation shown in Studio, when available. */
  architectureBrief?: string;
  /** The reconstruction-level specification, intentionally secondary in the UI. */
  referenceSpec?: string;
}

export const DIAGRAM_EXAMPLES: DiagramExample[] = [
  {
    id: "bedrock-claims-processing",
    title: "Claims processing with Amazon Bedrock",
    description: "A claims workflow that combines S3 document intake, Bedrock Data Automation, SageMaker fraud detection, DynamoDB state, Nova insights, and email notification.",
    tags: ["AWS", "Bedrock", "claims", "AI"],
    source: bedrockClaimsProcessingSource,
    prompt: BEDROCK_CLAIMS_PROMPT,
    architectureBrief: BEDROCK_CLAIMS_BRIEF,
    referenceSpec: BEDROCK_CLAIMS_REFERENCE,
  },
  {
    id: "aws-data-transfer-hub",
    title: "AWS Data Transfer Hub",
    description: "A compact cross-account deployment flow for UI hosting, authentication, workflow automation, replication templates, and Fargate workloads.",
    tags: ["AWS", "cross-account", "Fargate", "replication"],
    source: awsDataTransferHubSource,
    prompt: DATA_TRANSFER_HUB_PROMPT,
    architectureBrief: DATA_TRANSFER_HUB_BRIEF,
    referenceSpec: DATA_TRANSFER_HUB_REFERENCE,
  },
  {
    id: "aws-high-availability-web-app",
    title: "Highly available AWS web application",
    description: "A multi-AZ web application with CloudFront, API Gateway, ECS on Fargate, DynamoDB, ECR, and CloudWatch.",
    tags: ["AWS", "high availability", "multi-AZ"],
    source: awsHighAvailabilityWebAppSource,
    prompt: HIGH_AVAILABILITY_PROMPT,
    architectureBrief: HIGH_AVAILABILITY_BRIEF,
    referenceSpec: HIGH_AVAILABILITY_REFERENCE,
  },
  {
    id: "simple-serverless-web-application",
    title: "Simple serverless web application",
    description: "A minimal serverless web path from a client through CloudFront and API Gateway to Lambda and DynamoDB.",
    tags: ["AWS", "serverless", "beginner"],
    source: simpleServerlessWebApplicationSource,
    prompt: SIMPLE_SERVERLESS_WEB_APPLICATION_PROMPT,
    architectureBrief: SIMPLE_SERVERLESS_WEB_APPLICATION_BRIEF,
    referenceSpec: SIMPLE_SERVERLESS_WEB_APPLICATION_REFERENCE,
  },
  {
    id: "image-thumbnail-pipeline",
    title: "Image thumbnail pipeline",
    description: "A direct-upload image flow that uses an S3 event to invoke Lambda and persist thumbnails and metadata.",
    tags: ["AWS", "S3", "events"],
    source: imageThumbnailPipelineSource,
    prompt: IMAGE_THUMBNAIL_PIPELINE_PROMPT,
    architectureBrief: IMAGE_THUMBNAIL_PIPELINE_BRIEF,
    referenceSpec: IMAGE_THUMBNAIL_PIPELINE_REFERENCE,
  },
  {
    id: "asynchronous-report-generation",
    title: "Asynchronous report generation",
    description: "An API-driven report workflow with SQS, a Fargate worker, storage, job status, and email notification.",
    tags: ["AWS", "async", "SQS"],
    source: asynchronousReportGenerationSource,
    prompt: ASYNCHRONOUS_REPORT_GENERATION_PROMPT,
    architectureBrief: ASYNCHRONOUS_REPORT_GENERATION_BRIEF,
    referenceSpec: ASYNCHRONOUS_REPORT_GENERATION_REFERENCE,
  },
  {
    id: "event-driven-order-fulfillment",
    title: "Event-driven order fulfillment",
    description: "An order service that persists state and fans OrderCreated events out to inventory, payment, shipping, and notifications.",
    tags: ["AWS", "events", "fulfillment"],
    source: eventDrivenOrderFulfillmentSource,
    prompt: EVENT_DRIVEN_ORDER_FULFILLMENT_PROMPT,
    architectureBrief: EVENT_DRIVEN_ORDER_FULFILLMENT_BRIEF,
    referenceSpec: EVENT_DRIVEN_ORDER_FULFILLMENT_REFERENCE,
  },
  {
    id: "azure-private-app-service",
    title: "Private Azure App Service",
    description: "A private write-through application using App Service, Functions, Managed Redis, SQL Database, private endpoints, and Azure Monitor.",
    tags: ["Azure", "App Service", "private networking"],
    source: azurePrivateAppServiceSource,
    prompt: AZURE_PRIVATE_APP_SERVICE_PROMPT,
    architectureBrief: AZURE_PRIVATE_APP_SERVICE_BRIEF,
    referenceSpec: AZURE_PRIVATE_APP_SERVICE_REFERENCE,
  },
  {
    id: "gcp-streaming-analytics",
    title: "Google Cloud streaming analytics",
    description: "A streaming platform with Cloud Load Balancing, Functions, Pub/Sub, Dataflow, BigQuery, GKE, and operational controls.",
    tags: ["GCP", "streaming", "analytics"],
    source: gcpStreamingAnalyticsSource,
    prompt: GCP_STREAMING_ANALYTICS_PROMPT,
    architectureBrief: GCP_STREAMING_ANALYTICS_BRIEF,
    referenceSpec: GCP_STREAMING_ANALYTICS_REFERENCE,
  },
  {
    id: "cloud-agnostic-order-processing",
    title: "Cloud-agnostic order processing",
    description: "A provider-neutral order flow through a gateway, queue, workers, database, object storage, and security boundaries.",
    tags: ["Cloud-agnostic", "orders", "queue"],
    source: cloudAgnosticOrderProcessingSource,
    prompt: CLOUD_AGNOSTIC_ORDER_PROCESSING_PROMPT,
    architectureBrief: CLOUD_AGNOSTIC_ORDER_PROCESSING_BRIEF,
    referenceSpec: CLOUD_AGNOSTIC_ORDER_PROCESSING_REFERENCE,
  },
];
