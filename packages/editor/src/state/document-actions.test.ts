import { describe, expect, it, vi } from "vitest";
import { createEmptyDocument, getDefaultView } from "@dumb-diagrams/runtime/core";
import { parseDgmResult, printDgm } from "@dumb-diagrams/runtime/dsl";
import { compileDiagramSource, getCachedDiagramCompilation } from "../diagram-compiler";
import { deleteSelection, moveSelection, setGroupBounds, setPlace } from "../editor-model";
import { resizeRect } from "../interactions/move-resize-gestures";
import { preserveManualLayout, preserveUnplacedManualLayout } from "../model/layout-preservation";
import { prepareDocument, prepareDocumentMutation } from "./document-actions";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

const azureAppSource = `diagram azure-private-app-service {
  grammar azure
  flow lr
  title "Azure private write-through application"
  cloud-agnostic.client client "Client application"
  azure.subscription subscription "Azure subscription" {
    azure.region region "Azure region" {
      cloud-agnostic.boundary architecture "Write-through application" {
        style dashed
        color blue
        fill none
        azure.vnet vnet "Azure virtual network" {
          cloud-agnostic.boundary application_tier "Application tier" {
            azure.app-services app_service { service "App Service" }
            azure.function-apps functions { service "Write-through functions" }
          }
          azure.private-endpoints redis_pe { service "Redis private endpoint" }
          azure.private-endpoints sql_pe { service "SQL private endpoint" }
        }
        azure.sql-database sql { service "Azure SQL Database" }
        azure.azure-managed-redis redis { service "Azure Managed Redis" }
        azure.monitor monitor { service "Azure Monitor" }
      }
    }
  }
  client -> app_service { id https_requests step 1 label "HTTPS requests" kind flow }
  app_service -> redis_pe { id cache_reads step 2 label "Cache reads" kind flow }
  redis_pe -> redis { id redis_private_link label "private link" kind flow }
  app_service -> sql_pe { id cache_miss_reads step 3 label "Cache-miss reads" kind flow }
  sql_pe -> sql { id sql_private_link label "private link" kind flow }
  app_service -> functions { id writes step 4 label "Write requests" kind flow }
  functions -> sql_pe { id authoritative_writes step 5 label "Authoritative writes" kind flow }
  functions -> redis_pe { id cache_updates step 6 label "Write-through cache update" kind flow }
  app_service -> monitor { id app_telemetry label "Metrics and logs" style dashed kind peer }
  redis -> monitor { id redis_telemetry style dashed kind peer }
  sql -> monitor { id sql_telemetry style dashed kind peer }
}`;

describe("document action preparation", () => {
  it("keeps a canvas edit exactly where it was placed instead of repairing it", () => {
    const source = `diagram small_overlap {
      grammar aws
      cloud-agnostic.server api "API"
      cloud-agnostic.server db "Database"
      api -> db
    }`;
    const result = prepareDocumentMutation(
      source,
      (doc) => setPlace(setPlace(doc, "api", 200, 80), "db", 200, 80),
      false,
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const compiled = compileDiagramSource(result.value.source, false);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(getDefaultView(result.value.doc).places.api).toMatchObject({ x: 200, y: 80 });
    expect(getDefaultView(result.value.doc).places.db).toMatchObject({ x: 200, y: 80 });
    expect(compiled.invariantFailures.length).toBeGreaterThan(0);
  });

  it("does not invoke a mutation on an invalid source draft", () => {
    const change = vi.fn((doc) => doc);
    const result = prepareDocumentMutation("diagram { unfinished", change, true);
    expect(result.isErr() && result.error.code).toBe("invalid-source");
    expect(change).not.toHaveBeenCalled();
  });

  it("preserves an unexpected mutation cause instead of reporting invalid syntax", () => {
    const source = printDgm(createEmptyDocument("original"));
    const cause = new TypeError("mutation defect");
    const result = prepareDocumentMutation(
      source,
      () => {
        throw cause;
      },
      true,
    );
    expect(result.isErr() && result.error.code).toBe("unexpected");
    expect(result.isErr() && result.error.cause).toBe(cause);
  });

  it("rejects a failed precompilation before a source can be published", () => {
    const result = prepareDocument(createEmptyDocument("original"), true, {
      ok: false,
      issues: [{ level: "error", code: "routing", message: "Routing failed" }],
      svg: null,
      invariantFailures: [],
    });
    expect(result.isErr() && result.error).toMatchObject({ code: "compilation", message: "Routing failed" });
  });

  it("reports the compilation error when an earlier warning is present", () => {
    const result = prepareDocument(createEmptyDocument("original"), true, {
      ok: false,
      issues: [
        { level: "warning", code: "routing-budget", message: "Routing took too long" },
        { level: "error", code: "compilation", message: "Render failed" },
      ],
      svg: null,
      invariantFailures: [],
    });
    expect(result.isErr() && result.error).toMatchObject({ code: "compilation", message: "Render failed" });
  });

  it("leaves a gesture drop's compile to the display worker but still validates it", () => {
    const source = `diagram deferred_drop {
      grammar aws
      cloud-agnostic.server api "API"
    }`;
    const moved = prepareDocumentMutation(source, (doc) => setPlace(doc, "api", 240, 96), true, true);
    expect(moved.isOk() && getCachedDiagramCompilation(moved.value.source, true)).toBeUndefined();
    const duplicated = prepareDocumentMutation(
      source,
      (doc) => ({ ...doc, resources: [...doc.resources, doc.resources[0]!] }),
      true,
      true,
    );
    expect(duplicated.isErr() && duplicated.error.code).toBe("invalid-document");
  });

  it("returns the serialized validated mutation for publication", () => {
    const source = printDgm(createEmptyDocument("original"));
    const result = prepareDocumentMutation(source, (doc) => ({ ...doc, title: "Renamed" }), true);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.doc.title).toBe("Renamed");
      expect(result.value.source).toBe(printDgm(result.value.doc));
    }
  });

  it("snapshots compiled geometry without mutating the source document or its pinned routes", () => {
    const source = `${azureAppSource}
view default {
  place app_service { visible false z 3 }
  place architecture { locked z 2 }
  route https_requests { point 100 100 point 200 100 pin mode manual badge 0.25 top }
}`;
    const doc = parseDgm(source);
    const before = structuredClone(doc);
    const compiled = compileDiagramSource(source, true);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const next = preserveManualLayout(doc, compiled.layout);
    expect(doc).toEqual(before);
    expect(getDefaultView(next).routes.https_requests).toEqual(getDefaultView(doc).routes.https_requests);
    expect(getDefaultView(next).places.app_service).toMatchObject({
      visible: false,
      zIndex: 3,
      pin: true,
      manual: true,
    });
    expect(getDefaultView(next).places.architecture).toMatchObject({
      locked: true,
      zIndex: 2,
      pin: true,
      manual: true,
    });
    expect(getDefaultView(next).places.__unknown).toBeUndefined();
    expect(next.resources).toEqual(doc.resources);
    expect(next.groups).toEqual(doc.groups);
  });

  it("does not replace an authored pin when preserving unplaced geometry", () => {
    const source = `${azureAppSource}
view default {
  place app_service { x 11 y 13 pin manual locked z 3 }
  place architecture { locked z 2 }
}`;
    const doc = parseDgm(source);
    const compiled = compileDiagramSource(source, true);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;

    const next = preserveUnplacedManualLayout(doc, compiled.layout);
    expect(getDefaultView(next).places.app_service).toEqual(getDefaultView(doc).places.app_service);
    expect(getDefaultView(next).places.architecture).toMatchObject({
      x: compiled.layout.groups.find((group) => group.id === "architecture")!.bounds.x,
      y: compiled.layout.groups.find((group) => group.id === "architecture")!.bounds.y,
      locked: true,
      zIndex: 2,
    });
    expect(getDefaultView(next).places.architecture).toMatchObject({ pin: true, manual: true });
  });

  it("keeps a moved Azure resource and its surviving geometry stable after compilation", () => {
    const baseline = compileDiagramSource(azureAppSource, false);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const result = prepareDocumentMutation(
      azureAppSource,
      (doc) => moveSelection(doc, [{ kind: "resource", id: "app_service" }], 32, 16),
      false,
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    const after = compileDiagramSource(result.value.source, false);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const appAfter = after.layout.nodes.find((node) => node.id === "app_service")!.obstacle;
    expect(appAfter.x).toBe(getDefaultView(result.value.doc).places.app_service!.x);
    expect(appAfter.y).toBe(getDefaultView(result.value.doc).places.app_service!.y);
    for (const group of baseline.layout.groups) {
      const next = after.layout.groups.find((candidate) => candidate.id === group.id);
      expect(next?.bounds).toEqual(group.bounds);
    }
    for (const node of baseline.layout.nodes.filter((candidate) => candidate.id !== "app_service")) {
      const next = after.layout.nodes.find((candidate) => candidate.id === node.id);
      expect(next?.obstacle).toEqual(node.obstacle);
    }
  });

  it("keeps every unmoved entity stable when moving with grid snapping enabled", () => {
    const baseline = compileDiagramSource(azureAppSource, true);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const result = prepareDocumentMutation(
      azureAppSource,
      (doc) => moveSelection(doc, [{ kind: "resource", id: "app_service" }], 32, 16),
      true,
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    const after = compileDiagramSource(result.value.source, true);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    for (const group of baseline.layout.groups) {
      const next = after.layout.groups.find((candidate) => candidate.id === group.id);
      expect(next?.bounds).toEqual(group.bounds);
    }
    for (const node of baseline.layout.nodes.filter((candidate) => candidate.id !== "app_service")) {
      const next = after.layout.nodes.find((candidate) => candidate.id === node.id);
      expect(next?.obstacle).toEqual(node.obstacle);
    }
  });

  it("keeps surviving geometry stable when deleting an Azure resource", () => {
    const baseline = compileDiagramSource(azureAppSource, false);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    const result = prepareDocumentMutation(
      azureAppSource,
      (doc) => deleteSelection(doc, [{ kind: "resource", id: "functions" }]),
      false,
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    const after = compileDiagramSource(result.value.source, false);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.doc.resources.some((resource) => resource.id === "functions")).toBe(false);
    for (const group of baseline.layout.groups) {
      const next = after.layout.groups.find((candidate) => candidate.id === group.id);
      expect(next?.bounds).toEqual(group.bounds);
    }
    for (const node of baseline.layout.nodes.filter((candidate) => candidate.id !== "functions")) {
      const next = after.layout.nodes.find((candidate) => candidate.id === node.id);
      expect(next?.obstacle).toEqual(node.obstacle);
    }
  });

  it.each(["e", "se", "w", "nw"] as const)(
    "enlarges a group from %s without rearranging its contents or surrounding items",
    (handle) => {
      const baseline = compileDiagramSource(azureAppSource, true);
      expect(baseline.ok).toBe(true);
      if (!baseline.ok) return;
      const group = baseline.layout.groups.find((candidate) => candidate.id === "subscription")!;
      const bounds = resizeRect(
        group.bounds,
        handle,
        handle.includes("w") ? -160 : 160,
        handle.includes("n") ? -96 : 96,
        32,
        true,
      );
      const result = prepareDocumentMutation(azureAppSource, (doc) => setGroupBounds(doc, group.id, bounds), true);
      expect(result.isOk()).toBe(true);
      if (result.isErr()) return;
      // Compile the serialized source, as happens when saving and reopening.
      const after = compileDiagramSource(result.value.source, true);
      expect(after.ok).toBe(true);
      if (!after.ok) return;
      expect(after.layout.groups.find((candidate) => candidate.id === group.id)?.bounds).toEqual(
        Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.round(value)])),
      );
      for (const original of baseline.layout.groups.filter((candidate) => candidate.id !== group.id)) {
        expect(after.layout.groups.find((candidate) => candidate.id === original.id)?.bounds, original.id).toEqual(
          original.bounds,
        );
      }
      for (const original of baseline.layout.nodes) {
        expect(after.layout.nodes.find((candidate) => candidate.id === original.id)?.obstacle, original.id).toEqual(
          original.obstacle,
        );
      }
    },
  );

  it("moves a group's internal connector with its endpoints in Manual mode", () => {
    const before = compileDiagramSource(azureAppSource, true);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const result = prepareDocumentMutation(
      azureAppSource,
      (doc) => moveSelection(doc, [{ kind: "group", id: "application_tier" }], 64, 32),
      true,
    );
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const after = compileDiagramSource(result.value.source, true);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    const original = before.layout.edges.find((edge) => edge.id === "writes")!;
    const moved = after.layout.edges.find((edge) => edge.id === "writes")!;
    expect(moved.points.length).toBe(original.points.length);
    for (const [index, point] of original.points.entries()) {
      expect(moved.points[index]!.x - point.x).toBeCloseTo(64, 0);
      expect(moved.points[index]!.y - point.y).toBeCloseTo(32, 0);
    }
  });

  it("re-routes a moved icon's connector straight instead of stretching its old path", () => {
    const source = `diagram async_processing {
      grammar aws
      flow lr
      aws.api-gateway api "API"
      cloud-agnostic.boundary async_tier "Async processing" {
        aws.simple-queue-service jobs "Processing jobs"
        aws.simple-queue-service dlq "Dead-letter queue"
        aws.aws-lambda worker "Worker"
      }
      api -> jobs { id enqueue style dashed }
      jobs -> worker { id process label "process" }
      jobs -> dlq { id failed label "failed processing" style dashed kind fail }
    }
    view default {
      place async_tier { x 120 y 20 w 600 h 640 pin manual }
      place api { x 20 y 120 pin manual }
      place jobs { x 240 y 120 pin manual }
      place worker { x 520 y 120 pin manual }
      place dlq { x 400 y 300 pin manual }
    }`;
    const edge = (compiled: ReturnType<typeof compileDiagramSource>, id: string) => {
      if (!compiled.ok) throw new Error("Expected the diagram to compile");
      return compiled.layout.edges.find((candidate) => candidate.id === id)!.points;
    };
    const before = compileDiagramSource(source, true);
    // Drop the dead-letter queue directly below the processing queue.
    const moved = prepareDocumentMutation(
      source,
      (doc) => moveSelection(doc, [{ kind: "resource", id: "dlq" }], -160, 120),
      true,
    );
    expect(moved.isOk()).toBe(true);
    if (moved.isErr()) return;
    const after = compileDiagramSource(moved.value.source, true);

    const [start, end, ...rest] = edge(after, "failed");
    expect(rest).toEqual([]);
    expect(start!.x).toBe(end!.x);
    expect(end!.y).toBeGreaterThan(start!.y);
    expect(edge(after, "enqueue")).toEqual(edge(before, "enqueue"));
    expect(edge(after, "process")).toEqual(edge(before, "process"));

    // The re-routed connector is frozen again by the next unrelated edit.
    const next = prepareDocumentMutation(
      moved.value.source,
      (doc) => moveSelection(doc, [{ kind: "resource", id: "worker" }], 40, 0),
      true,
    );
    expect(next.isOk()).toBe(true);
    if (next.isErr()) return;
    expect(edge(compileDiagramSource(next.value.source, true), "failed")).toEqual([start, end]);
  });
});
