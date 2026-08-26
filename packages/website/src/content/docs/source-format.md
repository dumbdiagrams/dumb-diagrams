---
title: The .dgm format
description: Describe the services, boundaries, and connections. Save visual decisions separately inside the same file.
section: Make diagrams
order: 3
---
A `.dgm` document has an architecture description and, when needed, saved views. The architecture says what exists and how it connects. A view records the visual decisions you want to keep.

## A complete example

Save this as `diagrams/payments.dgm`:

```dgm
diagram payments {
  grammar aws
  flow lr
  title "Payments platform"

  generic.user customer "Customer"
  aws.region region "AWS Region" {
    aws.api-gateway api "Payments API"
    aws.aws-lambda handler "Payment handler"
    aws.dynamodb ledger "Payment ledger"
  }

  customer -> api { id request step 1 }
  api -> handler { id invoke step 2 }
  handler -> ledger { id persist step 3 }
}
```

The customer sits outside the region. The three AWS services sit inside it. The arrows describe a numbered request path from the customer to the ledger.

## Resources and boundaries

A resource declaration starts with its catalog type, followed by a stable ID and an optional quoted label:

```text
aws.aws-lambda handler "Payment handler"
```

The type selects the icon and rules. The ID is how other parts of the document refer to the resource. The label is what people see. Changing the label does not change the service type.

Groups use braces to contain resources or other groups. Provider groups such as regions, VPCs, and subnets carry architecture meaning. A plain `group` is useful for a logical boundary.

Not every resource belongs inside every boundary. The catalog includes containment rules, and validation checks them before layout.

## Connections and flow

An arrow connects two IDs. Edge metadata gives the connection more context:

```text
api -> handler {
  id invoke
  step 2
  from e
  to w
  label "process payment"
}
```

Use stable edge IDs so saved route decisions continue to refer to the same relationship. `step` numbers the main flow. `from` and `to` suggest connector sides: north, east, south, or west. A face preference and an exact fractional port have different strength; [routing and layout](../routing/) explains the distinction.

Supporting relationships can use `style dashed` and `kind peer`. Keep the primary path easy to follow instead of giving every edge equal emphasis.

At the document level, `flow lr` asks for left-to-right layout; `flow tb` asks for top-to-bottom layout.

## Saved views

You do not need a `view` block to get a useful first diagram. Start with automatic layout.

When you move or resize an item, or pin a route in Studio, those overrides can be stored in a view. The runtime applies authored positions after the automatic structure is laid out. A human choice survives the next render.

If an agent changes the architecture, ask it to preserve existing view information. Visual overrides are part of the document, not disposable editor cache.

## Validate and format

```bash
npx create-dumb-diagrams@latest validate diagrams/payments.dgm
npx create-dumb-diagrams@latest format diagrams/payments.dgm
```

`format` prints canonical source without changing the file. Add `--write` when you want to save it. Validation checks IDs, references, service types, containment, labels, ports, and other document constraints, then compiles the diagram and reports routing notes.
