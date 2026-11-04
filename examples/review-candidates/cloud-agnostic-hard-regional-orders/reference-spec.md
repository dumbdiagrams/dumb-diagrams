# Reference specification

## Entities

| ID | Canonical type | Label | Containment |
| --- | --- | --- | --- |
| buyer | cloud-agnostic.client | Public buyer | External |
| payment_service | cloud-agnostic.server | External payment service | External |
| warehouse | cloud-agnostic.server | External warehouse system | External |
| cloud | cloud-agnostic.cloud | Cloud environment | Root |
| account | cloud-agnostic.account | Orders account | cloud |
| primary_region | cloud-agnostic.region | Primary region | account |
| primary_lb | cloud-agnostic.load-balancer | Primary load balancer | primary_region |
| primary_network | cloud-agnostic.network | Primary private application network | primary_region |
| app_cluster | cloud-agnostic.cluster | Application cluster | primary_network |
| api | cloud-agnostic.server | Order API server | app_cluster |
| worker | cloud-agnostic.server | Fulfillment worker server | app_cluster |
| primary_db | cloud-agnostic.database | Primary order database | primary_network |
| primary_cache | cloud-agnostic.cache | Primary order cache | primary_network |
| fulfillment_queue | cloud-agnostic.queue | Regional fulfillment queue | primary_region |
| receipts | cloud-agnostic.object-storage | Order receipts storage | primary_region |
| recovery_region | cloud-agnostic.region | Recovery region | account |
| recovery_lb | cloud-agnostic.load-balancer | Recovery load balancer | recovery_region |
| recovery_network | cloud-agnostic.network | Recovery network | recovery_region |
| recovery_db | cloud-agnostic.database | Recovery database replica | recovery_network |
| recovery_app | cloud-agnostic.server | Recovery application server | recovery_network |

## Connections

| ID | From -> to | Meaning |
| --- | --- | --- |
| primary_buyer_request | buyer -> primary_lb | Order request |
| primary_route_request | primary_lb -> api | Primary routing |
| read_write_orders | api -> primary_db | Order data |
| return_order_data | primary_db -> api | Return order data |
| use_order_cache | api -> primary_cache | Read and update cache |
| return_cached_order | primary_cache -> api | Return cached order |
| authorize_payment | api -> payment_service | Authorize payment |
| payment_result | payment_service -> api | Authorization result |
| enqueue_fulfillment | api -> fulfillment_queue | Enqueue fulfillment |
| deliver_fulfillment | fulfillment_queue -> worker | Consume fulfillment job |
| retry_fulfillment | worker -> fulfillment_queue | Retry job |
| send_fulfillment | worker -> warehouse | Fulfillment request |
| warehouse_acknowledgment | warehouse -> worker | Fulfillment acknowledgment |
| persist_order_status | worker -> primary_db | Write order status |
| store_receipt | worker -> receipts | Store receipt |
| replicate_orders | primary_db -> recovery_db | Replicate order data |
| read_replica | recovery_app -> recovery_db | Read replica data |
| recovery_buyer_request | buyer -> recovery_lb | Recovery order request |
| recovery_route_request | recovery_lb -> recovery_app | Serve recovery request |
