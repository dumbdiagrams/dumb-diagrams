# Architecture brief

## Goal

Provider-neutral order processing in one cloud account with primary and recovery regions, replicated database, and failover path. Provider/grammar: `cloud-agnostic`.

## Explicit requirements

- Buyer reaches regional load balancer to API server in primary private network and cluster; database and cache in network; API calls external payment and enqueues in regional queue; queue feeds worker; worker to external warehouse with ack and retry; writes status and receipts; DB replicates to recovery database; recovery app serves buyer via recovery load balancer.
- No other services beyond those named.

## Relationships and containment

- `buyer` → `lb`: Orders.
- `lb` → `api`: Forward.
- `api` → `db`: Query.
- `api` → `cache`: Lookup.
- `api` → `payment`: Charge.
- `db` → `api`: Database response, dashed.
- `cache` → `api`: Cache response, dashed.
- `payment` → `api`: Payment response, dashed.
- `api` → `queue`: Enqueue work.
- `queue` → `worker`: Work.
- `worker` → `warehouse`: Fulfillment.
- `warehouse` → `worker`: Acknowledgment, dashed.
- `worker` → `queue`: Retry (fail).
- `worker` → `db`: Order status.
- `worker` → `receipts`: Receipts.
- `db` → `rdb`: Replication.
- `rdb` → `rapp`: Read replica.
- `buyer` → `rlb`: Failover requests, dashed.
- `rlb` → `rapp`: Forward, dashed.

- `buyer` (Buyer) at root, outside any boundary.
- `payment` (External payment service) at root, outside any boundary.
- `warehouse` (External warehouse) at root, outside any boundary.
- `account` (Cloud account) at root, outside any boundary.
- `primary` (Primary region) inside `account`.
- `lb` (Load balancer) inside `primary`.
- `network` (Primary application network) inside `primary`.
- `cluster` (Application cluster) inside `network`.
- `api` (API server) inside `cluster`.
- `worker` (Worker server) inside `cluster`.
- `db` (Primary database) inside `network`.
- `cache` (Cache) inside `network`.
- `queue` (Work queue) inside `primary`.
- `receipts` (Receipt storage) inside `primary`.
- `recovery` (Recovery region) inside `account`.
- `rlb` (Recovery load balancer) inside `recovery`.
- `rnetwork` (Recovery network) inside `recovery`.
- `rapp` (Recovery app server) inside `rnetwork`.
- `rdb` (Recovery database) inside `rnetwork`.

## Inferred decisions and exclusions

- Response arrows and the failover path are dashed unnumbered flows so request step ordering stays valid.
- Automatic layout, left-to-right; no manual coordinates.
