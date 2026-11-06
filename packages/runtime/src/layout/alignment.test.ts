import { describe, expect, it } from "vitest";

import { parseDgmResult } from "../dsl/index.js";
import { alignAutomaticIconCentres, AUTOMATIC_GRID_SIZE, isSimpleAutomaticGridFlow } from "./automatic-grid.js";
import { layoutDocument } from "./layout.js";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

const staticWebsite = `diagram aws_static_website_delivery {
  grammar aws
  flow lr

  cloud-agnostic.client visitor "Website visitor"
  aws.cloud aws_cloud "AWS Cloud" {
    cloud-agnostic.boundary web_delivery "Static website delivery" {
      aws.route-53 dns "DNS"
      aws.cloudfront cdn "Content delivery service"
      aws.simple-storage-service site_bucket "Website files bucket"
    }
  }

  visitor -> dns { id resolve_site label "look up website" }
  dns -> cdn { id deliver_site label "resolve to content delivery" }
  cdn -> site_bucket { id fetch_site label "website files" }
}`;

const gcpSimpleApi = `diagram gcp_simple_api {
  grammar gcp
  flow lr

  cloud-agnostic.client caller "API caller"
  gcp.project project "Customer API project" {
    gcp.cloud-load-balancing load_balancer "Load balancer"
    gcp.cloud-run api "API service"
    gcp.cloud-sql database "Database"
  }

  caller -> load_balancer
  load_balancer -> api
  api -> database
}`;

describe("automatic root flow alignment", () => {
  it("aligns the AWS simple website service row and external visitor to the shared grid", () => {
    const doc = parseDgm(staticWebsite);
    const layout = layoutDocument(doc);
    const visitor = layout.nodes.find((node) => node.id === "visitor")!;
    const row = ["dns", "cdn", "site_bucket"].map((id) => layout.nodes.find((node) => node.id === id)!);
    const centerY = (node: (typeof layout.nodes)[number]) => node.icon.y + node.icon.h / 2;

    expect(new Set([...row, visitor].map(centerY)).size).toBe(1);
    for (const node of [...row, visitor]) {
      expect(centerY(node) / AUTOMATIC_GRID_SIZE).toBeCloseTo(Math.round(centerY(node) / AUTOMATIC_GRID_SIZE));
    }
    for (const node of layout.nodes.filter((node) => node.id !== visitor.id)) {
      expect(overlaps(visitor.obstacle, node.obstacle)).toBe(false);
    }
    for (const group of layout.groups) {
      expect(overlaps(visitor.obstacle, group.bounds)).toBe(false);
    }
    const frame = layout.groups.find((group) => group.id === "web_delivery")!.content;
    for (const node of row) expect(contains(frame, node.icon)).toBe(true);
    for (let left = 0; left < layout.nodes.length; left++) {
      for (let right = left + 1; right < layout.nodes.length; right++) {
        expect(overlaps(layout.nodes[left]!.obstacle, layout.nodes[right]!.obstacle)).toBe(false);
      }
    }
  });

  it("keeps the GCP easy service row and external caller on shared icon centres", () => {
    const layout = layoutDocument(parseDgm(gcpSimpleApi));
    const row = ["load_balancer", "api", "database", "caller"].map(
      (id) => layout.nodes.find((node) => node.id === id)!,
    );
    const centres = row.map((node) => node.icon.y + node.icon.h / 2);

    expect(new Set(centres).size).toBe(1);
    for (const node of row) {
      const centreX = node.icon.x + node.icon.w / 2;
      const centreY = node.icon.y + node.icon.h / 2;
      expect(centreX / AUTOMATIC_GRID_SIZE).toBeCloseTo(Math.round(centreX / AUTOMATIC_GRID_SIZE));
      expect(centreY / AUTOMATIC_GRID_SIZE).toBeCloseTo(Math.round(centreY / AUTOMATIC_GRID_SIZE));
    }
  });

  it("preserves an explicitly pinned external visitor", () => {
    const doc = parseDgm(staticWebsite);
    doc.views[0]!.places.visitor = { x: 64, y: 96, pin: true };

    const visitor = layoutDocument(doc).nodes.find((node) => node.id === "visitor")!;

    expect(visitor.obstacle).toMatchObject({ x: 64, y: 96 });
  });

  it("aligns secondary 36px icons by centre and keeps pinned members fixed", () => {
    const doc = parseDgm(staticWebsite);
    for (const resource of doc.resources) resource.role = "secondary";
    doc.views[0]!.places.dns = { x: 720, y: 720, pin: true, manual: true };

    const layout = layoutDocument(doc);
    const dns = layout.nodes.find((node) => node.id === "dns")!;
    const others = ["cdn", "site_bucket", "visitor"].map((id) => layout.nodes.find((node) => node.id === id)!);
    const center = (node: (typeof layout.nodes)[number]) => node.icon.y + node.icon.h / 2;

    expect(dns.obstacle).toMatchObject({ x: 720, y: 720 });
    expect(dns.icon).toMatchObject({ w: 36, h: 36 });
    for (const node of others) {
      expect(node.icon.w).toBe(36);
      expect(center(node) / AUTOMATIC_GRID_SIZE).toBeCloseTo(Math.round(center(node) / AUTOMATIC_GRID_SIZE));
    }
    expect(dns.icon.w).toBe(36);
    expect(new Set(others.map(center)).size).toBe(1);
    expect(center(dns)).not.toBe(center(others[0]!));
  });

  it("does not force alignment for an external resource with multiple neighbors", () => {
    const doc = parseDgm(`diagram multi_target_client {
  grammar aws
  flow lr

  cloud-agnostic.client client "Client"
  aws.cloud aws_cloud "AWS Cloud" {
    cloud-agnostic.boundary services "Services" {
      aws.aws-lambda first "First service"
      aws.aws-lambda second "Second service"
    }
  }

  client -> first
  client -> second
}`);
    const layout = layoutDocument(doc);
    const client = layout.nodes.find((node) => node.id === "client")!;
    const first = layout.nodes.find((node) => node.id === "first")!;

    expect(client.icon.y + client.icon.h / 2).not.toBe(first.icon.y + first.icon.h / 2);
  });

  it("snaps a two-resource chain without shrinking its reserved label run", () => {
    const doc = parseDgm(`diagram labelled_chain {
  grammar aws
  flow lr
  cloud-agnostic.boundary services "Services" {
    aws.aws-lambda first "First"
    aws.aws-lambda second "Second"
  }
  first -> second { id labelled label "Important notification" }
}`);
    expect(isSimpleAutomaticGridFlow(doc)).toBe(true);
    const layout = layoutDocument(doc);
    const first = layout.nodes.find((node) => node.id === "first")!;
    const second = layout.nodes.find((node) => node.id === "second")!;
    const required = "Important notification".length * 11 * 0.55 + 16;

    expect(second.icon.x - (first.icon.x + first.icon.w)).toBeGreaterThanOrEqual(required);
  });

  it("leaves a dense branched document on its natural layout", () => {
    const doc = parseDgm(`diagram dense_branch {
  grammar aws
  flow lr
  aws.aws-lambda source "Source"
  aws.aws-lambda one "One"
  aws.aws-lambda two "Two"
  aws.aws-lambda three "Three"
  source -> one
  source -> two
  source -> three
}`);
    expect(isSimpleAutomaticGridFlow(doc)).toBe(false);

    const layout = layoutDocument(doc);
    const centres = layout.nodes.map((node) => node.icon.x + node.icon.w / 2);
    expect(
      centres.some(
        (centre) => Math.abs(centre / AUTOMATIC_GRID_SIZE - Math.round(centre / AUTOMATIC_GRID_SIZE)) > 1e-6,
      ),
    ).toBe(true);
  });

  it("keeps the source layout immutable while trying a grid candidate", () => {
    const doc = parseDgm(`diagram single_resource {
  grammar aws
  aws.aws-lambda worker "Worker"
}`);
    const sourceLayout = layoutDocument(doc);
    const sourceNode = sourceLayout.nodes[0]!;
    for (const rect of [sourceNode.icon, sourceNode.label, sourceNode.obstacle]) {
      rect.x += 3;
      rect.y += 3;
    }
    const input = structuredClone(sourceLayout);

    const aligned = alignAutomaticIconCentres(doc, sourceLayout);

    expect(sourceLayout).toEqual(input);
    const node = aligned.nodes[0]!;
    expect((node.icon.x + node.icon.w / 2) / AUTOMATIC_GRID_SIZE).toBeCloseTo(
      Math.round((node.icon.x + node.icon.w / 2) / AUTOMATIC_GRID_SIZE),
    );
    expect((node.icon.y + node.icon.h / 2) / AUTOMATIC_GRID_SIZE).toBeCloseTo(
      Math.round((node.icon.y + node.icon.h / 2) / AUTOMATIC_GRID_SIZE),
    );
  });

  it("rejects an unsafe nearest grid target and retains a safe candidate", () => {
    const doc = parseDgm(`diagram candidate_safety {
  grammar aws
  aws.aws-lambda first "First"
  aws.aws-lambda second "Second"
}`);
    const layout = layoutDocument(doc);
    const first = layout.nodes.find((node) => node.id === "first")!;
    const second = layout.nodes.find((node) => node.id === "second")!;
    first.icon = { x: 0, y: 19, w: 48, h: 48 };
    first.label = { x: 0, y: 0, w: 40, h: 12 };
    first.obstacle = { x: 0, y: 20, w: 40, h: 20 };
    second.icon = { x: 0, y: 56, w: 48, h: 48 };
    second.label = { x: 0, y: 40, w: 40, h: 12 };
    second.obstacle = { x: 0, y: 44, w: 40, h: 20 };

    const aligned = alignAutomaticIconCentres(doc, layout);
    const alignedFirst = aligned.nodes.find((node) => node.id === "first")!;

    expect(alignedFirst.icon.y + alignedFirst.icon.h / 2).toBe(24);
    expect(overlaps(alignedFirst.obstacle, aligned.nodes.find((node) => node.id === "second")!.obstacle)).toBe(false);
  });
});

describe("singleton Azure VNet sizing", () => {
  it("fits a single private endpoint without the multi-rail minimum width", () => {
    const doc = parseDgm(`diagram singleton_private_endpoint {
  grammar azure
  flow lr

  azure.subscription subscription "Subscription" {
    azure.region region "Region" {
      azure.resource-group resource_group "Resource Group" {
        azure.vnet app_network "Application Network" {
          azure.private-endpoints sql_pe "SQL Private Endpoint"
        }
      }
    }
  }
}`);

    const vnet = layoutDocument(doc).groups.find((group) => group.id === "app_network")!;

    expect(vnet.bounds.w).toBeLessThan(360);
  });
});

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function contains(
  outer: { x: number; y: number; w: number; h: number },
  inner: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}
