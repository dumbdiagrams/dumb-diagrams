# Architecture brief

## Goal

Show a small provider-neutral customer-record API in a production account and primary region inside an application cloud.

## Explicit requirements

- An external web client sends HTTPS requests through an API gateway to a customer API service.
- The API reads and writes customer records in a customer database.
- Nest a production account and primary region inside an application cloud; keep the client outside the cloud.
- Use automatic left-to-right routing and add no provider-specific products or other infrastructure.

## Relationships and containment

- The client request passes through the gateway to the API, which accesses the customer database.
- The production account and primary region contain all three services; the web client remains outside the application cloud.

## Inferred decisions and exclusions

- The brief interprets the database read/write relationship as one labeled application-to-database connector because no separate response arrow was requested.
- No additional services or logical boundaries are introduced.
