import type { Grammar } from "./types.js";

export interface ProviderRules {
  /** The provider's own name for an isolated network boundary. */
  network: string;
  /** Managed services that are reached over public endpoints, not deployed into the network. */
  outsideNetwork: ReadonlySet<string>;
}

export const PROVIDER_RULES: Readonly<Record<Grammar, ProviderRules>> = {
  aws: {
    network: "VPC",
    outsideNetwork: new Set([
      "aws.dynamodb",
      "aws.simple-storage-service",
      "aws.simple-queue-service",
      "aws.simple-notification-service",
      "aws.cloudfront",
      "aws.route-53",
      "aws.api-gateway",
      "aws.cognito",
      "aws.eventbridge",
      "aws.cloudwatch",
    ]),
  },
  azure: {
    network: "VNet",
    outsideNetwork: new Set([
      "azure.storage-accounts",
      "azure.azure-cosmos-db",
      "azure.key-vaults",
      "azure.front-door-and-cdn-profiles",
      "azure.dns-zones",
      "azure.azure-service-bus",
      "azure.event-grid-topics",
      "azure.monitor",
    ]),
  },
  gcp: {
    network: "VPC network",
    outsideNetwork: new Set([
      "gcp.cloud-storage",
      "gcp.bigquery",
      "gcp.pub-sub",
      "gcp.cloud-logging",
      "gcp.cloud-monitoring",
      "gcp.iam",
      "gcp.secret-manager",
    ]),
  },
  "cloud-agnostic": {
    network: "network",
    outsideNetwork: new Set(["cloud-agnostic.dns", "cloud-agnostic.object-storage", "cloud-agnostic.identity"]),
  },
};
