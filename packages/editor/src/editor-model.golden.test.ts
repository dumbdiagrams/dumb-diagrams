import source from "../../../tests/fixtures/engine/image-thumbnail-pipeline.dgm?raw";
import type { DiagramDocument } from "@dumb-diagrams/runtime/core";
import { parseDgmResult, printDgm } from "@dumb-diagrams/runtime/dsl";
import { layoutDocument } from "@dumb-diagrams/runtime/layout";
import { describe, expect, it } from "vitest";

import {
  addEdge,
  clearAllRoutes,
  clearPlaces,
  clearRoute,
  distributeSelection,
  moveSelection,
  reconnectEdge,
  renameEdge,
  renameGroup,
  sendToBack,
  sendToFront,
  setAnnotationPlace,
  setEdgeBadgePosition,
  setEdgeLabelPosition,
  setLocked,
  setRoute,
  setSize,
  setVisible,
  swapEdgeDirection,
  updateAnnotationText,
  updateGroupStep,
} from "./editor-model.js";
import { groupSelection, ungroup } from "./model/grouping.js";
import { prepareDocumentMutation } from "./state/document-actions.js";

const parseDgm = (source: string) => parseDgmResult(source)._unsafeUnwrap();

const base = parseDgm(source);
const layout = layoutDocument(base);
const annotated = (doc: DiagramDocument): DiagramDocument => ({
  ...doc,
  annotations: [...doc.annotations, { id: "note", text: "Retry on failure", anchor: "thumbnail_processor" }],
});
const routed = setRoute(base, "processor_to_metadata", [
  { x: 600, y: 200 },
  { x: 600, y: 320 },
]);

// Each row is an editor operation; its snapshot is the exact .dgm Studio saves.
const operations: Array<[string, (doc: DiagramDocument) => DiagramDocument]> = [
  ["moveSelection", (doc) => moveSelection(doc, [{ kind: "resource", id: "cdn" }], 48, 24, layout)],
  ["setSize", (doc) => setSize(doc, "processing", 240, 160)],
  ["setRoute", () => routed],
  ["clearRoute", () => clearRoute(routed, "processor_to_metadata")],
  ["clearAllRoutes", () => clearAllRoutes(routed)],
  ["clearPlaces", (doc) => clearPlaces(moveSelection(doc, [{ kind: "resource", id: "cdn" }], 48, 0, layout), ["cdn"])],
  [
    "reconnectEdge",
    (doc) => reconnectEdge(doc, "uploader_to_cdn", { target: "upload_ui", targetPort: "w", targetPortOffset: 0.25 }),
  ],
  ["swapEdgeDirection", (doc) => swapEdgeDirection(doc, "cdn_to_upload_ui")],
  ["addEdge", (doc) => addEdge(doc, "image_metadata", "cdn", "n", "s").doc],
  ["renameEdge", (doc) => renameEdge(doc, "processor_to_metadata", "write metadata")],
  ["renameGroup", (doc) => renameGroup(doc, "processing", "Image processing")],
  ["updateGroupStep", (doc) => updateGroupStep(doc, "processing", 5)],
  ["setLocked", (doc) => setLocked(doc, "resource", "cdn", true)],
  ["setVisible", (doc) => setVisible(doc, "resource", "image_metadata", false)],
  ["setAnnotationPlace", (doc) => setAnnotationPlace(annotated(doc), "note", 640, 96)],
  ["updateAnnotationText", (doc) => updateAnnotationText(annotated(doc), "note", "Retry twice, then alert")],
  ["setEdgeBadgePosition", (doc) => setEdgeBadgePosition(doc, "uploader_to_cdn", 0.25, "bottom")],
  ["setEdgeLabelPosition", (doc) => setEdgeLabelPosition(doc, "cdn_to_upload_ui", 0.75, "top")],
  ["sendToFront", (doc) => sendToFront(doc, "cdn")],
  ["sendToBack", (doc) => sendToBack(doc, "cdn")],
  [
    "groupSelection",
    (doc) =>
      groupSelection(
        doc,
        [
          { kind: "resource", id: "thumbnail_images" },
          { kind: "resource", id: "image_metadata" },
        ],
        layout,
        "Outputs",
      )!.doc,
  ],
  ["ungroup", (doc) => ungroup(doc, "processed_assets", layout).doc],
  [
    "distributeSelection",
    (doc) =>
      distributeSelection(
        doc,
        [
          { kind: "resource", id: "cdn" },
          { kind: "resource", id: "original_images" },
          { kind: "resource", id: "thumbnail_processor" },
        ],
        layout,
        "horizontal",
      ),
  ],
];

describe("editor operations write canonical .dgm", () => {
  it.each(operations)("%s", async (name, operation) => {
    const printed = printDgm(operation(structuredClone(base)));
    if (name.startsWith("clear")) expect(printed).toBe(printDgm(base));
    else expect(printed).not.toBe(printDgm(base));
    expect(printDgm(parseDgm(printed))).toBe(printed);
    await expect(printed).toMatchFileSnapshot(`__snapshots__/editor-model/${name}.dgm`);
  });

  it.each(
    operations.filter(([name]) =>
      ["moveSelection", "renameEdge", "groupSelection", "swapEdgeDirection"].includes(name),
    ),
  )("%s publishes the same edit through prepareDocumentMutation", (_name, operation) => {
    const prepared = prepareDocumentMutation(source, operation, false)._unsafeUnwrap();
    const reparsed = parseDgm(prepared.source);
    const direct = parseDgm(printDgm(operation(structuredClone(base))));
    expect(reparsed.edges).toEqual(direct.edges);
    expect(reparsed.groups).toEqual(direct.groups);
    expect(reparsed.resources.map((resource) => [resource.id, resource.parent, resource.label])).toEqual(
      direct.resources.map((resource) => [resource.id, resource.parent, resource.label]),
    );
  });
});
