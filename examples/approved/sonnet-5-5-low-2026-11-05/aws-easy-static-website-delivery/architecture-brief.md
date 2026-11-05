# Architecture brief

## Goal
Simple AWS static website delivery diagram (grammar: `aws`, flow `lr`).

## Explicit requirements
- Website visitor, DNS, a content delivery service, and a bucket storing the website files.

## Relationships and containment
- Visitor -> DNS (Route 53) -> CDN (CloudFront) -> S3 bucket.
- Visitor is outside the AWS Cloud; DNS, CDN, and bucket are inside it.

## Inferred decisions and exclusions
- DNS = Route 53, content delivery = CloudFront, bucket = S3 (AWS provider implied).
- Chain order follows the listed order of the request.
- No WAF, logging, certificates, or other services added.
