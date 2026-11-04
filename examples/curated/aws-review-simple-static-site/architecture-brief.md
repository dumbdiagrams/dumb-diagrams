# Architecture brief

## Intent and explicit requirements

- Provider: AWS.
- Workload: serve a static website.
- Show only the visitor, DNS, content delivery, and website storage.

## Normalized components

- A generic website visitor outside AWS.
- An AWS Cloud boundary and a `Static website delivery` logical boundary.
- Route 53 for website DNS, CloudFront for content delivery, and S3 for website files.

## Directed relationships

- Visitor → Route 53 to resolve the site.
- Route 53 → CloudFront for an HTTPS request.
- CloudFront → the S3 website bucket for static files.

## Placement and exclusions

- Keep all AWS services inside AWS Cloud and the delivery boundary.
- Do not add an API, compute, authentication, databases, monitoring, or other services.
- Use left-to-right automatic layout without fixed positions or routes.
