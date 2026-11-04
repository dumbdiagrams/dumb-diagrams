# Reference specification

Create `AWS static website` with AWS grammar and left-to-right flow.

## Entities and containment

- Generic client `visitor`, label `Website visitor`, outside AWS.
- AWS cloud `aws_cloud`, label `AWS Cloud`.
- Logical boundary `web_delivery`, label `Static website delivery`, inside AWS Cloud.
- Route 53 resource `dns`, label `Website DNS`, inside `web_delivery`.
- CloudFront resource `cdn`, label `Content delivery`, inside `web_delivery`.
- S3 resource `site_bucket`, label `Website files`, inside `web_delivery`.

## Directed connections

- `visitor` → `dns`, label `look up site`.
- `dns` → `cdn`, label `HTTPS request`.
- `cdn` → `site_bucket`, label `static files`.

No other entities or connections are part of this example.
