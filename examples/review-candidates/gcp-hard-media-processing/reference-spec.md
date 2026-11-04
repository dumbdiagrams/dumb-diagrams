# Reference specification

## Entities

| ID | Canonical type | Label | Containment |
| --- | --- | --- | --- |
| producer | cloud-agnostic.client | Media producer | External |
| ops_client | cloud-agnostic.client | Operations client | External |
| organization | gcp.organization | Google Cloud organization | Root |
| project | gcp.project | Media processing project | organization |
| load_balancer | gcp.cloud-load-balancing | Cloud Load Balancing | project |
| input_bucket | gcp.cloud-storage | Input media bucket | project |
| processed_bucket | gcp.cloud-storage | Processed media bucket | project |
| jobs_topic | gcp.pub-sub | Media jobs topic | project |
| dead_letter_topic | gcp.pub-sub | Dead-letter topic | project |
| completion_topic | gcp.pub-sub | Completion topic | project |
| primary_region | gcp.region | Primary region | project |
| ingest | gcp.cloud-run | Media ingest service | primary_region |
| notifier | gcp.cloud-run | Completion notification service | primary_region |
| job_status | gcp.cloud-sql | Job status database | primary_region |
| processing_vpc | gcp.vpc | Processing VPC | project |
| subnet_a | gcp.subnet | us-central1 subnet A | processing_vpc; primary-region subnet |
| worker_a | gcp.compute-engine | Media worker A | subnet_a |
| subnet_b | gcp.subnet | us-central1 subnet B | processing_vpc; primary-region subnet |
| worker_b | gcp.compute-engine | Media worker B | subnet_b |

## Connections

| ID | From -> to | Meaning |
| --- | --- | --- |
| upload_request | producer -> load_balancer | Upload media |
| route_upload | load_balancer -> ingest | Route upload |
| store_input | ingest -> input_bucket | Store source object |
| enqueue_job | ingest -> jobs_topic | Publish processing job |
| deliver_job_a | jobs_topic -> worker_a | Deliver job |
| deliver_job_b | jobs_topic -> worker_b | Deliver job |
| read_input_a | worker_a -> input_bucket | Read source object |
| read_input_b | worker_b -> input_bucket | Read source object |
| write_output_a | worker_a -> processed_bucket | Write processed object |
| write_output_b | worker_b -> processed_bucket | Write processed object |
| update_status_a | worker_a -> job_status | Update job status |
| update_status_b | worker_b -> job_status | Update job status |
| publish_completion_a | worker_a -> completion_topic | Publish completion |
| publish_completion_b | worker_b -> completion_topic | Publish completion |
| deliver_completion | completion_topic -> notifier | Deliver completion |
| notify_operations | notifier -> ops_client | Processing result |
| dead_letter_job | jobs_topic -> dead_letter_topic | Undeliverable jobs |
| inspect_dead_letters | ops_client -> dead_letter_topic | Inspect dead letters |
| deliberate_redrive | ops_client -> jobs_topic | Deliberate redrive |
