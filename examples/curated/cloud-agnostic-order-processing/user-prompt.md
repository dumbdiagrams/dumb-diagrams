Create a cloud-agnostic left-to-right order-processing diagram. Keep storefront
clients outside an application cloud, then nest a production account, primary
region, and private network. Group a gateway and firewall at the edge, an order
service, queue, worker, and orders database inside the private network. Keep
receipt storage in a regional data-services placement outside the private
network. Connect the complete numbered request and fulfillment flow with
automatic orthogonal routing.
