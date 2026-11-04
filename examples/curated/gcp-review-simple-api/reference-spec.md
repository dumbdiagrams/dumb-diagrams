# Reference specification

## Entities

- External client: `client` (`cloud-agnostic.client`, label `Web client`).
- `organization` (`gcp.organization`, label `Google Cloud organization`).
- `project` (`gcp.project`, label `Customer API project`).
- `region` (`gcp.region`, label `Primary region`).
- `load_balancer` (`gcp.cloud-load-balancing`, label `Cloud Load Balancing`).
- `api` (`gcp.cloud-run`, label `Customer API (Cloud Run)`).
- `database` (`gcp.cloud-sql`, label `Customer database (Cloud SQL)`).

## Containment

- `client` is outside Google Cloud.
- `organization` contains `project`.
- `project` contains `region`.
- `region` contains `load_balancer`, `api`, and `database`.

## Edges

- `client` → `load_balancer`, id `https_requests`, label `HTTPS requests`,
  step 1, flow.
- `load_balancer` → `api`, id `api_requests`, step 2, flow.
- `api` → `database`, id `customer_data`, label `Read and write customers`,
  step 3, flow.

No other entities or edges are required.
