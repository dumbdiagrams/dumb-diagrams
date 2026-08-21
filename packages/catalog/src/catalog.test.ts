import { describe, expect, it } from "vitest";

import {
  getCatalogEntry,
  listAssets,
  listCategories,
  listProviders,
  searchAssets,
} from "./catalog.js";

describe("generated catalog", () => {
  it("includes database services", () => {
    expect(getCatalogEntry("aws.neptune")?.serviceName).toContain("Neptune");
    expect(getCatalogEntry("aws.aurora")?.serviceName).toContain("Aurora");
    expect(getCatalogEntry("aws.rds")?.serviceName).toContain("RDS");
  });

  it("uses compact conventional AWS names", () => {
    expect(getCatalogEntry("aws.simple-storage-service")?.serviceName).toBe("S3");
    expect(getCatalogEntry("aws.aws-database-migration-service")?.serviceName).toBe("DMS");
    expect(getCatalogEntry("aws.managed-streaming-for-apache-kafka")?.serviceName).toBe("MSK");
    expect(getCatalogEntry("aws.vpc-nat-gateway")?.serviceName).toBe("VPC NAT Gateway");
  });

  it("lists providers and categories", () => {
    expect(listProviders()).toEqual(
      ["aws", "azure", "gcp", "cloud-agnostic"],
    );
    expect(listCategories("aws")).toContain("Databases");
    expect(listCategories("generic", "resources")).toContain("Actors");
  });

  it("searches across providers", () => {
    const results = searchAssets("sql database", "azure");
    expect(results.length).toBeGreaterThan(0);
  });

  it("supports the all-provider filter", () => {
    const allResources = listAssets("all", { assetKind: "resource" });
    const awsResources = listAssets("aws", { assetKind: "resource" });
    expect(allResources.length).toBeGreaterThan(awsResources.length);
    expect(searchAssets("database", "all").some((entry) => entry.provider !== "aws")).toBe(true);
    expect(listCategories("all")).toContain("Databases");
  });

  it("includes key multi-cloud database services", () => {
    expect(getCatalogEntry("aws.aurora")).toBeDefined();
    expect(getCatalogEntry("aws.neptune")).toBeDefined();
    expect(getCatalogEntry("azure.sql-database")).toBeDefined();
    expect(getCatalogEntry("gcp.bigquery")).toBeDefined();
  });
});
