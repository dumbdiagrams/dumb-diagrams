# Architecture brief

## Goal

Show a customer-facing AWS storefront feeding an order domain and an
EventBridge-based fulfillment fan-out.

## Explicit requirements

- Customer → CloudFront → S3 storefront for static content.
- CloudFront → API Gateway → Order service Lambda.
- Order service persists orders in DynamoDB and publishes an `OrderCreated`
  event to EventBridge.
- EventBridge independently invokes inventory and payment Lambda services,
  shipping Fargate, and customer-notifications SNS.
- Do not connect fulfillment services directly to each other.

## Containment and relationships

- Use `Customer experience`, `Order domain`, `Event backbone`, and `Fulfillment
  services` boundaries inside AWS Cloud.
- Keep the customer actor outside AWS.
- EventBridge is the single fan-out point for reserve-stock, authorize-payment,
  create-shipment, and send-confirmation event flows.

## Inferred decisions and exclusions

- The four logical boundaries make the customer, order, event, and fulfillment
  responsibilities explicit without adding infrastructure.
- Dashed event relationships distinguish asynchronous fan-out from the solid
  request and persistence path.
- Do not infer queues, Step Functions, API-level authentication, VPC
  networking, WAF, Route 53, CloudWatch, or other services not requested.
- Keep the request path compact and the four event branches independently
  readable; layout must follow, not redefine, the event semantics.
