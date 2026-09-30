import { createEmptyDocument } from "./src/core/document.js";
import type { DiagramDocument } from "./src/core/types.js";

export function createAsyncDocsFixture(): DiagramDocument {
  const doc = createEmptyDocument("async-docs");
  doc.flow = "lr";

  doc.resources = [
    {
      id: "client",
      type: "cloud-agnostic.actor",
      label: { service: "External Client" },
      role: "primary",
      props: {},
    },
    {
      id: "api_alb",
      type: "aws.elastic-load-balancing",
      parent: "pubA",
      label: {
        service: "Elastic Load Balancing",
        role: "Document API ALB",
      },
      role: "primary",
      props: {},
    },
    {
      id: "api_alb_b",
      type: "aws.elastic-load-balancing",
      parent: "pubB",
      label: {
        service: "Elastic Load Balancing",
        role: "Document API ALB",
      },
      role: "primary",
      props: {},
    },
    {
      id: "apiA",
      type: "aws.elastic-container-service",
      parent: "appA",
      label: { service: "Amazon ECS", role: "Document API" },
      role: "primary",
      props: {},
    },
    {
      id: "apiB",
      type: "aws.elastic-container-service",
      parent: "appB",
      label: { service: "Amazon ECS", role: "Document API" },
      role: "primary",
      props: {},
    },
    {
      id: "workerA",
      type: "aws.elastic-container-service",
      parent: "appA",
      label: { service: "Amazon ECS", role: "Document worker" },
      role: "primary",
      props: {},
    },
    {
      id: "workerB",
      type: "aws.elastic-container-service",
      parent: "appB",
      label: { service: "Amazon ECS", role: "Document worker" },
      role: "primary",
      props: {},
    },
    {
      id: "jobs",
      type: "aws.simple-queue-service",
      parent: "queues",
      label: { service: "Amazon SQS", role: "Processing queue" },
      role: "primary",
      props: {},
    },
    {
      id: "jobs_dlq",
      type: "aws.simple-queue-service",
      parent: "queues",
      label: { service: "Amazon SQS", role: "DLQ" },
      role: "secondary",
      props: {},
    },
    {
      id: "artifacts",
      type: "aws.simple-storage-service",
      parent: "storage",
      label: { service: "Amazon S3", role: "Processed artifacts" },
      role: "primary",
      props: {},
    },
  ];

  doc.groups = [
    {
      id: "use1",
      kind: "region",
      label: "AWS Region (us-east-1)",
      children: ["main", "queues", "storage"],
    },
    {
      id: "main",
      kind: "vpc",
      parent: "use1",
      label: "VPC",
      children: ["azA", "azB"],
    },
    {
      id: "azA",
      kind: "az",
      parent: "main",
      label: "Availability Zone A",
      children: ["pubA", "appA"],
    },
    {
      id: "azB",
      kind: "az",
      parent: "main",
      label: "Availability Zone B",
      children: ["pubB", "appB"],
    },
    {
      id: "pubA",
      kind: "subnet-public",
      parent: "azA",
      label: "Public Subnet A",
      children: ["api_alb"],
    },
    {
      id: "pubB",
      kind: "subnet-public",
      parent: "azB",
      label: "Public Subnet B",
      children: ["api_alb_b"],
    },
    {
      id: "appA",
      kind: "subnet-private",
      parent: "azA",
      label: "Private App Subnet A",
      children: ["apiA", "workerA"],
    },
    {
      id: "appB",
      kind: "subnet-private",
      parent: "azB",
      label: "Private App Subnet B",
      children: ["apiB", "workerB"],
    },
    {
      id: "queues",
      kind: "logical",
      parent: "use1",
      label: "Async Queue Tier",
      children: ["jobs", "jobs_dlq"],
    },
    {
      id: "storage",
      kind: "logical",
      parent: "use1",
      label: "Storage Tier",
      children: ["artifacts"],
    },
  ];

  doc.edges = [
    {
      id: "e1",
      source: "client",
      target: "api_alb",
      step: 1,
      style: "solid",
      kind: "flow",
    },
    {
      id: "e2",
      source: "api_alb",
      target: "apiA",
      style: "solid",
      kind: "flow",
    },
    {
      id: "e3",
      source: "apiA",
      target: "jobs",
      style: "solid",
      kind: "flow",
    },
    {
      id: "e4",
      source: "jobs",
      target: "workerA",
      style: "solid",
      kind: "flow",
    },
    {
      id: "e5",
      source: "workerA",
      target: "artifacts",
      style: "solid",
      kind: "flow",
    },
    {
      id: "e6",
      source: "jobs",
      target: "jobs_dlq",
      style: "dashed",
      kind: "fail",
    },
  ];

  return doc;
}

export function createTransferHubFixture(): DiagramDocument {
  const doc = createEmptyDocument("transfer-hub");
  doc.flow = "lr";

  doc.resources = [
    {
      id: "user",
      type: "cloud-agnostic.actor",
      label: { service: "User" },
      role: "primary",
      props: {},
    },
    {
      id: "ui",
      type: "cloud-agnostic.client",
      parent: "customer",
      label: { service: "Data Transfer Hub UI" },
      role: "primary",
      props: {},
    },
    {
      id: "cognito",
      type: "aws.cognito",
      parent: "auth",
      label: { service: "Amazon Cognito" },
      role: "primary",
      props: {},
    },
    {
      id: "appsync",
      type: "aws.aws-appsync",
      parent: "customer",
      label: { service: "AWS AppSync" },
      role: "primary",
      props: {},
    },
    {
      id: "cloudfront",
      type: "aws.cloudfront",
      parent: "customer",
      label: { service: "Amazon CloudFront" },
      role: "primary",
      props: {},
    },
    {
      id: "sfn",
      type: "aws.aws-step-functions",
      parent: "workflow",
      label: { service: "AWS Step Functions" },
      role: "primary",
      props: {},
    },
    {
      id: "lambda1",
      type: "aws.aws-lambda",
      parent: "workflow",
      label: { service: "AWS Lambda", role: "Workflow task" },
      role: "primary",
      props: {},
    },
    {
      id: "cfn",
      type: "aws.aws-cloudformation",
      parent: "workflow",
      label: { service: "AWS CloudFormation" },
      role: "primary",
      props: {},
    },
    {
      id: "s3_templates",
      type: "aws.simple-storage-service",
      parent: "managed",
      label: { service: "Amazon S3", role: "Templates" },
      role: "primary",
      props: {},
    },
    {
      id: "s3_images",
      type: "aws.simple-storage-service",
      parent: "managed",
      label: { service: "Amazon S3", role: "Images" },
      role: "primary",
      props: {},
    },
  ];

  doc.groups = [
    {
      id: "cloud",
      kind: "cloud",
      label: "AWS Cloud",
      children: ["customer", "managed"],
    },
    {
      id: "customer",
      kind: "account",
      parent: "cloud",
      label: "Customer's AWS Account",
      children: ["ui", "auth", "appsync", "cloudfront", "workflow"],
    },
    {
      id: "managed",
      kind: "account",
      parent: "cloud",
      label: "AWS Managed Account",
      children: ["s3_templates", "s3_images"],
    },
    {
      id: "auth",
      kind: "logical",
      parent: "customer",
      label: "Authentication",
      children: ["cognito"],
    },
    {
      id: "workflow",
      kind: "logical",
      parent: "customer",
      label: "AWS Step Functions workflow",
      children: ["sfn", "lambda1", "cfn"],
    },
  ];

  doc.edges = [
    { id: "s1", source: "user", target: "ui", step: 1, style: "solid" },
    { id: "s2", source: "ui", target: "appsync", step: 2, style: "solid" },
    { id: "s3", source: "appsync", target: "cloudfront", step: 3, style: "solid" },
    { id: "s4", source: "cloudfront", target: "sfn", step: 4, style: "solid" },
    { id: "s5", source: "sfn", target: "lambda1", step: 5, style: "solid" },
    { id: "s6", source: "lambda1", target: "s3_templates", step: 6, style: "solid" },
    { id: "s7", source: "cfn", target: "s3_images", step: 7, style: "solid" },
    { id: "s8", source: "ui", target: "cognito", step: 8, style: "dashed" },
  ];

  return doc;
}
