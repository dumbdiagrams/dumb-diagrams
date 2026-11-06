# Architecture brief

## Goal

A simple AWS static website delivery chain: visitor, DNS, CDN, and the S3 bucket holding site files. Provider/grammar: `aws`.

## Explicit requirements

- Show a website visitor, DNS, a content delivery service, and the bucket that stores the website files.

## Relationships and containment

- `visitor` → `dns`: Resolve domain.
- `dns` → `cdn`: Alias to CDN.
- `cdn` → `bucket`: Fetch files.

- `visitor` (Website visitor) at root, outside any boundary.
- `aws` (AWS Cloud) at root, outside any boundary.
- `dns` (DNS) inside `aws`.
- `cdn` (CDN) inside `aws`.
- `bucket` (Website bucket) inside `aws`.

## Inferred decisions and exclusions

- The AWS Cloud boundary is structurally required to place AWS services.
- Automatic layout, left-to-right; no manual coordinates.
