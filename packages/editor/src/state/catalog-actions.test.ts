import { describe, expect, it, vi } from "vitest";
import { createEmptyDocument, getDefaultView, type DiagramDocument } from "@dumb-diagrams/runtime/core";
import type { SelectionItem } from "../model/types";
import { getCatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { printDgm } from "@dumb-diagrams/runtime/dsl";
import { compileDiagramSource } from "../diagram-compiler";
import { createCatalogActions } from "./catalog-actions";

function setup() {
  const doc = createEmptyDocument("catalog-test");
  const compiled = compileDiagramSource(printDgm(doc), false);
  if (!compiled.ok) throw new Error("Fixture must compile");
  const commit = vi.fn<(doc: DiagramDocument) => boolean>(() => true);
  const selectInserted = vi.fn<(item: SelectionItem) => void>();
  const notify = vi.fn();
  return { doc, commit, selectInserted, notify,
    options: { context: { doc, layout: compiled.layout, selection: [], snapToGrid: false }, commit, selectInserted, notify } };
}

describe("catalog insertion workflow", () => {
  it("publishes before selection and preserves explicit canvas placement", () => {
    const { options, doc, commit, selectInserted } = setup();
    const actions = createCatalogActions(options);
    actions.addCatalogResource(getCatalogEntry("aws.aws-lambda")!, { parent: undefined, at: { x: 123, y: 456 } });
    const inserted = commit.mock.calls[0]![0];
    const item = selectInserted.mock.calls[0]![0];
    expect(getDefaultView(inserted).places[item.id]).toMatchObject({ x: 123, y: 456, manual: true });
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(selectInserted.mock.invocationCallOrder[0]!);
    expect(doc.resources).toHaveLength(0);
  });

  it("does not change selection after publication is rejected", () => {
    const { options, commit, selectInserted } = setup();
    commit.mockReturnValue(false);
    createCatalogActions(options).addBoundary();
    expect(commit).toHaveBeenCalledOnce();
    expect(selectInserted).not.toHaveBeenCalled();
  });

  it("reports a missing parent without publishing or selecting", () => {
    const { options, commit, selectInserted, notify } = setup();
    createCatalogActions(options).addCatalogResource(getCatalogEntry("aws.aws-lambda")!, {
      parent: "deleted-group", at: { x: 20, y: 20 },
    });
    expect(notify).toHaveBeenCalledWith("The selected parent group no longer exists.");
    expect(commit).not.toHaveBeenCalled();
    expect(selectInserted).not.toHaveBeenCalled();
  });

  it("rejects a mismatched drag payload without publishing", () => {
    const { options, commit, notify } = setup();
    createCatalogActions(options).drop(JSON.stringify({ type: "aws.aws-lambda", assetKind: "group" }), { x: 40, y: 40 });
    expect(commit).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("That catalog item is no longer available.");
  });
});
