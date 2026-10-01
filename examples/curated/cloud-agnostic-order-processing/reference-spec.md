Create a diagram titled "Cloud-agnostic order processing platform" using the
cloud-agnostic grammar and automatic left-to-right layout. Use only generic
catalog types. Preserve client outside cloud → account → region → network
containment. Inside the network, add edge (gateway, firewall), processing
(server, queue, worker), and data (database) boundaries. Keep receipt storage
at region scope outside the private network as a regional managed service.

Connect clients → firewall → gateway → order service → queue → worker. Connect
the worker to the orders database and receipt storage. Use solid numbered flow
edges and no manual positions, routes, or provider-specific resources.
