Create a diagram titled "Claims processing with Amazon Bedrock" using the AWS grammar and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

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

Keep both bands wide and compact, with the blueprint flow above the claims flow. Use orthogonal connectors, give every independent connection its own lane, keep the SNS-to-email connection perfectly straight, and do not let connector segments overlap resources, labels, group borders, or one another.
