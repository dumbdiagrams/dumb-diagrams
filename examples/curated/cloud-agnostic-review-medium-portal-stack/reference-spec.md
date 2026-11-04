# Reference specification

Create `Provider-neutral project portal` with cloud-agnostic grammar and left-to-right flow.

## Entities and containment

- Generic client `users`, label `Project team`, outside the cloud.
- Generic cloud `cloud`, label `Cloud environment`.
- Account `account`, label `Production account`, inside the cloud.
- Region `region`, label `Primary region`, inside the account.
- Load balancer `edge`, label `Portal load balancer`, inside the region and outside the private network.
- Network `private_network`, label `Private application network`, inside the region.
- Server `portal_api`, label `Project portal server`, inside the private network.
- Database `project_db`, label `Project metadata`, inside the private network.
- Cache `metadata_cache`, label `Project lookup cache`, inside the private network.
- Object storage `attachments`, label `Project attachments`, inside the region and outside the private network.

## Directed connections

- `users` → `edge`, label `portal requests`.
- `edge` → `portal_api`, label `project requests`.
- `project_db` → `portal_api`, label `project data`.
- `metadata_cache` → `portal_api`, label `cached lookups`.
- `attachments` → `portal_api`, label `project attachments`.

No other entities or connections are part of this example.
