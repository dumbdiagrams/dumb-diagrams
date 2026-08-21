import asyncDocsSource from "../../../examples/src/async-docs.dgm?raw";
import awsDataMeshDataZoneSource from "../../../examples/src/aws-data-mesh-datazone.dgm?raw";
import awsGovCloudPublicConnectivitySource from "../../../examples/src/aws-govcloud-public-connectivity.dgm?raw";
import awsSiteToSiteVpnSource from "../../../examples/src/aws-site-to-site-vpn.dgm?raw";
import transferHubSource from "../../../examples/src/transfer-hub.dgm?raw";

export interface DiagramExample {
  id: string;
  title: string;
  description: string;
  tags: string[];
  source: string;
}

export const DIAGRAM_EXAMPLES: DiagramExample[] = [
  {
    id: "aws-site-to-site-vpn",
    title: "AWS Site-to-Site VPN over Direct Connect",
    description: "An Amazon VPC connected to a corporate network through an IPSec VPN carried over a Direct Connect public VIF.",
    tags: ["AWS", "hybrid", "networking"],
    source: awsSiteToSiteVpnSource,
  },
  {
    id: "aws-govcloud-public-connectivity",
    title: "AWS GovCloud public connectivity",
    description: "Public-IP connectivity between commercial and GovCloud Regions using internet gateways, NAT, and an ALB.",
    tags: ["AWS", "GovCloud", "networking"],
    source: awsGovCloudPublicConnectivitySource,
  },
  {
    id: "aws-data-mesh-datazone",
    title: "Data mesh with Amazon DataZone",
    description: "A multi-account data mesh spanning ingestion, producer storage and processing, central governance, and analytics consumers.",
    tags: ["AWS", "DataZone", "analytics"],
    source: awsDataMeshDataZoneSource,
  },
  {
    id: "async-docs",
    title: "Async Docs",
    description: "A multi-AZ document API with queues, workers, and durable artifact storage.",
    tags: ["AWS", "queues", "multi-AZ"],
    source: asyncDocsSource,
  },
  {
    id: "transfer-hub",
    title: "Transfer Hub",
    description: "A transfer workflow showing public ingress, private processing, and storage tiers.",
    tags: ["AWS", "storage", "workflow"],
    source: transferHubSource,
  },
];
