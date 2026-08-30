Create a diagram titled "Event-driven order fulfillment" using the AWS grammar and a left-to-right flow. Use automatic layout only: do not add a view block, manual node positions, or manual edge routes.

Composition and hierarchy:
- Put a generic Customer outside the AWS Cloud on the far left.
- Inside the AWS Cloud, create a group titled "Customer experience" containing CloudFront labelled "Storefront delivery" and an S3 bucket labelled "Storefront".
- Place API Gateway to the right of the customer experience group.
- Create a group titled "Order domain" containing a Lambda labelled "Order service" and DynamoDB labelled "Orders database".
- Create a group titled "Event backbone" containing EventBridge labelled "Order events".
- Create a group titled "Fulfillment services" containing Lambda resources labelled "Inventory service" and "Payment service", plus Fargate labelled "Shipping service".
- Add SNS labelled "Customer notifications" to the far right.
- Do not connect the fulfillment services directly to one another.

Connections and numbered stages:
1. Customer to CloudFront; put badge 1 on this connection.
2. CloudFront to the Storefront S3 bucket; label this connection "static content".
3. CloudFront to API Gateway; put badge 2 on this connection.
4. API Gateway to the Order service Lambda; put badge 3 on this connection.
5. Order service to Orders database; put badge 4 on this connection and label it "persist order".
6. Order service to EventBridge Order events; put badge 5 on this connection and label it "OrderCreated".
7. Order events to Inventory service using a dashed event connection labelled "reserve stock".
8. Order events to Payment service using a dashed event connection labelled "authorize payment".
9. Order events to Shipping service using a dashed event connection labelled "create shipment".
10. Order events to Customer notifications SNS using a dashed event connection labelled "send confirmation".

Keep the customer-facing request path in a compact upper row. Make EventBridge the clear fan-out point below or beside the order domain. Keep all four event branches separate and avoid crossing them.

Use orthogonal connectors with separate lanes. Every connector must be a single simple path from source to target: no self-intersections, retraced segments, loops, overshoots, or dangling dead-end legs. Prefer short straight connections whenever nodes align. Keep group boundaries readable and do not let connectors overlap resources, labels, group borders, or one another.
