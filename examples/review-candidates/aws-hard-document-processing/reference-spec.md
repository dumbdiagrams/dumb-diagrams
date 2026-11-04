# Reference specification

## Entities

| ID | Canonical type | Label | Containment |
| --- | --- | --- | --- |
| client | cloud-agnostic.client | Document client | External |
| ops | cloud-agnostic.client | Operations user | External |
| aws_cloud | aws.cloud | AWS Cloud | Root |
| region | aws.region | AWS Region | aws_cloud |
| vpc | aws.vpc | Document processing VPC | region |
| az_a | aws.az | Availability Zone A | vpc |
| subnet_a | aws.subnet.private | Private subnet A | az_a |
| worker_a | aws.aws-fargate | Fargate worker A | subnet_a |
| az_b | aws.az | Availability Zone B | vpc |
| subnet_b | aws.subnet.private | Private subnet B | az_b |
| worker_b | aws.aws-fargate | Fargate worker B | subnet_b |
| managed | cloud-agnostic.boundary | Regional managed services | region |
| api | aws.api-gateway | API Gateway | managed |
| intake | aws.aws-lambda | Lambda intake | managed |
| input | aws.simple-storage-service | Input S3 bucket | managed |
| jobs | aws.simple-queue-service | Jobs queue | managed |
| dlq | aws.simple-queue-service | Dead-letter queue | managed |
| output | aws.simple-storage-service | Output S3 bucket | managed |
| status | aws.dynamodb | DynamoDB status table | managed |
| sns | aws.simple-notification-service | SNS completion topic | managed |
| global_delivery | cloud-agnostic.boundary | Global delivery | aws_cloud |
| cf | aws.cloudfront | CloudFront distribution | global_delivery |

## Connections

| ID | From -> to | Meaning |
| --- | --- | --- |
| submit | client -> api | Submit document |
| invoke_intake | api -> intake | Intake request |
| store_input | intake -> input | Store original |
| enqueue_job | intake -> jobs | Enqueue job |
| deliver_a | jobs -> worker_a | Consume job A |
| deliver_b | jobs -> worker_b | Consume job B |
| read_input_a | worker_a -> input | Read original |
| read_input_b | worker_b -> input | Read original |
| write_output_a | worker_a -> output | Write processed file |
| write_output_b | worker_b -> output | Write processed file |
| status_a | worker_a -> status | Update status |
| status_b | worker_b -> status | Update status |
| complete_a | worker_a -> sns | Publish completion |
| complete_b | worker_b -> sns | Publish completion |
| origin_fetch | cf -> output | Origin fetch |
| download | client -> cf | Request output download |
| max_attempts | jobs -> dlq | After maximum attempts |
| inspect_dlq | ops -> dlq | Inspect messages |
| inspect_status | ops -> status | Inspect status |
| notifications | sns -> ops | Completion notifications |
| redrive | dlq -> jobs | Redrive messages |
