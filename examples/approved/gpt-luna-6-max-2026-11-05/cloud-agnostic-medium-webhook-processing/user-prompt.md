Draw a provider-neutral, left-to-right webhook-processing diagram. An external
partner sends webhook events to an API gateway and webhook ingress function.
The ingress function queues events and writes an idempotency key to the event
database. An event processor consumes the queue, stores processed status in
the same database, and archives the payload in object storage. Nest a
production account, primary region, and private network inside an application
cloud. Place the gateway and ingress function together in a webhook-edge
boundary and place the queue, processor, and database in an event-processing
boundary within the network. Keep the payload archive in the region outside
the private network. Do not add other services and use automatic routing.
