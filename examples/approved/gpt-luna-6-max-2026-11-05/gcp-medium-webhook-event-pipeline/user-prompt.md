Draw a left-to-right Google Cloud webhook event pipeline. A partner sends
webhook events through Cloud Load Balancing to a Cloud Functions ingress
handler. The handler publishes to a Pub/Sub topic; Pub/Sub sends events to
Dataflow for processing. Dataflow writes processed records to BigQuery and raw
event files to Cloud Storage. Keep the partner outside the Google Cloud
organization. Nest the event-processing project and primary region in the
organization, and place all services in the region. Add no other services and
use automatic routing.
