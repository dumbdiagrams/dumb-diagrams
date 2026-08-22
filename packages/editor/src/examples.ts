import awsHighAvailabilityWebAppSource from "../../../examples/src/aws-high-availability-web-app.dgm?raw";

export interface DiagramExample {
  id: string;
  title: string;
  description: string;
  tags: string[];
  source: string;
}

export const DIAGRAM_EXAMPLES: DiagramExample[] = [
  {
    id: "aws-high-availability-web-app",
    title: "Highly available AWS web application",
    description: "A multi-AZ web application with CloudFront, API Gateway, ECS on Fargate, DynamoDB, ECR, and CloudWatch.",
    tags: ["AWS", "high availability", "multi-AZ"],
    source: awsHighAvailabilityWebAppSource,
  },
];
