Create a diagram titled "Highly available AWS web application" using the AWS grammar and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

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

Keep the frontend, VPC, both availability zones, and subnet boundaries easy to scan. Use compact orthogonal routing, reserve a distinct lane for every connector, prefer straight connections when source and target align, and never overlap solid and dashed routes.
