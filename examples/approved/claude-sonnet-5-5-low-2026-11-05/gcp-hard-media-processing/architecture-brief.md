# Architecture brief

## Goal

GCP media pipeline: LB to regional Cloud Run ingest, global Pub/Sub jobs, two Compute Engine workers in separate subnets of one VPC, completion notification, dead-letter and redrive. Provider/grammar: `gcp`.

## Explicit requirements

- Producer via Cloud Load Balancing to Cloud Run ingest; Cloud Storage and global Pub/Sub jobs; two Compute Engine workers in separate regional subnets of one VPC read, write, update Cloud SQL, publish completion; Cloud Run notifier to operations client; dead-letter topic and redrive.

## Relationships and containment

- `producer` → `lb`: Upload.
- `lb` → `ingest`: Route.
- `ingest` → `input`: Write input.
- `ingest` → `jobs`: Publish job.
- `jobs` → `worker1`: Jobs.
- `jobs` → `worker2`: Jobs.
- `input` → `worker1`: Read input.
- `input` → `worker2`: Read input.
- `worker1` → `output`: Processed objects.
- `worker2` → `output`: Processed objects.
- `worker1` → `db`: Job status.
- `worker2` → `db`: Job status.
- `worker1` → `completion`: Completion.
- `worker2` → `completion`: Completion.
- `completion` → `notifier`: Completion events.
- `notifier` → `ops`: Deliver notice.
- `jobs` → `dead`: Dead-letter (fail).
- `ops` → `dead`: Inspect (peer), dashed.
- `dead` → `jobs`: Redrive, dashed.

- `producer` (Media producer) at root, outside any boundary.
- `ops` (Operations client) at root, outside any boundary.
- `org` (Google Cloud organization) at root, outside any boundary.
- `project` (Project) inside `org`.
- `lb` (Load balancer) inside `project`.
- `jobs` (Jobs topic) inside `project`.
- `completion` (Completion topic) inside `project`.
- `dead` (Dead-letter topic) inside `project`.
- `region` (Region) inside `project`.
- `ingest` (Ingest service) inside `region`.
- `input` (Input bucket) inside `region`.
- `output` (Output bucket) inside `region`.
- `vpc` (VPC) inside `region`.
- `subnet_a` (Subnet A) inside `vpc`.
- `worker1` (Worker 1) inside `subnet_a`.
- `subnet_b` (Subnet B) inside `vpc`.
- `worker2` (Worker 2) inside `subnet_b`.
- `db` (Job status) inside `region`.
- `notifier` (Notification service) inside `region`.

## Inferred decisions and exclusions

- A separate output bucket is inferred so reads of input and writes of processed objects are distinct.
- The VPC is drawn inside the region as the container of the two regional subnets.
- Cloud Load Balancing is drawn at project scope as a global service.
- Automatic layout, left-to-right; no manual coordinates.
