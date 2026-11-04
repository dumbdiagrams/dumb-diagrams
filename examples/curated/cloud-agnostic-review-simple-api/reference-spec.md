# Reference specification

## Entities

- External client: `client` (`cloud-agnostic.client`, label `Web client`).
- `cloud` (`cloud-agnostic.cloud`, label `Application cloud`).
- `account` (`cloud-agnostic.account`, label `Production account`).
- `region` (`cloud-agnostic.region`, label `Primary region`).
- `gateway` (`cloud-agnostic.gateway`, label `API gateway`).
- `api` (`cloud-agnostic.server`, label `Customer API service`).
- `database` (`cloud-agnostic.database`, label `Customer database`).

## Containment

- `client` is outside the cloud.
- `cloud` contains `account`; `account` contains `region`.
- `region` contains `gateway`, `api`, and `database`.

## Edges

- `client` → `gateway`, id `https_requests`, label `HTTPS requests`, step 1,
  flow.
- `gateway` → `api`, id `api_requests`, step 2, flow.
- `api` → `database`, id `customer_data`, label `Read and write customers`,
  step 3, flow.

No other entities or edges are required.
