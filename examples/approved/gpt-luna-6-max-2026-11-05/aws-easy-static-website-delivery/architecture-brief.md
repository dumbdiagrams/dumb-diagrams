# Architecture brief

## Goal

Show a simple AWS static website delivery path from an external website visitor through DNS and content delivery to the bucket that stores the site files.

## Explicit requirements

- A website visitor is shown outside AWS.
- DNS, a content delivery service, and the website-files bucket are shown in AWS.

## Relationships and containment

- The visitor sends a site lookup to DNS; DNS resolves to the content delivery service; the content delivery service fetches website files from the bucket.

## Inferred decisions and exclusions

- Route 53 represents DNS, CloudFront represents content delivery, and S3 Bucket represents website file storage, using the canonical AWS catalog types.
