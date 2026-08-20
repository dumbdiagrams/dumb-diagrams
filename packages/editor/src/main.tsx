import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import type {
  DiagramDocument,
  EdgeKind,
  EdgeStyle,
  GroupKind,
  LayoutResult,
  Point,
  Side,
} from "@dumb-diagrams/core";
import {
  createAsyncDocsFixture,
  hasErrors,
  validateDocument,
} from "@dumb-diagrams/core";
import {
  getCatalogMap,
  catalogIconUrl,
  type CatalogEntry,
} from "@dumb-diagrams/catalog";
import { parseArch, printArch } from "@dumb-diagrams/dsl";
import { layoutDocument } from "@dumb-diagrams/layout";
import { GRAMMAR } from "@dumb-diagrams/grammar-aws";
import { renderPortableSvg, renderSvg } from "@dumb-diagrams/render";
import { routeEdges, attachRoutes } from "@dumb-diagrams/route";

import {
  addAnnotation,
  addEdge,
  addGroup,
  addResource,
  alignSelection,
  clearRoute,
  clearView,
  createOrthogonalRoute,
  deleteSelection,
  distributeSelection,
  nudgeSelection,
  pasteClipboard,
  primarySelection,
  reconnectEdge,
  renameEdge,
  renameGroup,
  renameResource,
  resourceIconSize,
  serializeClipboard,
  setResourceIconSize,
  setRoute,
  setSize,
  setTitle,
  setLocked,
  setVisible,
  sendToFront,
  sendToBack,
  swapEdgeDirection,
  toggleSelectionItem,
  updateEdge,
  addCustomResource,
  canPlaceCatalogEntry,
  duplicateSelection,
  importSvgAsset,
  moveSelection,
  updateAnnotationText,
  type Selection,
  type SelectionItem,
  type ResourceIconSize,
} from "./editor-model";
import { CanvasStage, clampZoom } from "./canvas/CanvasStage";
import { InteractionOverlay } from "./interactions/InteractionOverlay";
import { AssetBrowser } from "./panels/AssetBrowser";
import { ContextMenu } from "./panels/ContextMenu";
import { EdgePanel } from "./panels/EdgePanel";
import { ExportMenu } from "./panels/ExportMenu";
import { LayersPanel } from "./panels/LayersPanel";
import { SourceDrawer } from "./panels/SourceDrawer";
import { clearDraft, loadDraft, saveDraft } from "./state/autosave";
import { FloatingPanel } from "./ui/FloatingPanel";
import { IconFit, IconOpen, IconRedo, IconUndo } from "./ui/icons";
import { SegmentedControl } from "./ui/SegmentedControl";
import { ThemeControl } from "./ui/ThemeControl";
import { ToolDock, type ToolId } from "./ui/ToolDock";
import { initTheme } from "./ui/theme";
import { useSourceHistory } from "./useSourceHistory";
import "./styles.css";

initTheme();

const DEFAULT_SOURCE = printArch(createAsyncDocsFixture());
const RECOVERY = (() => {
  const draft = loadDraft();
  if (!draft) return null;
  try {
    const doc = parseArch(draft.source);
    if (hasErrors(validateDocument(doc, getCatalogMap()))) {
      clearDraft();
      return null;
    }
    return draft;
  } catch {
    clearDraft();
    return null;
  }
})();
type Mode = "auto" | "manual";
type Tool = ToolId;
type PendingPort = { nodeId: string; side: Side } | null;
type ContextMenuState = { x: number; y: number; item: SelectionItem } | null;

function App() {
  const {
    source,
    replace: replaceSource,
    commit: commitSource,
    resetHistory,
    beginTransaction,
    endTransaction,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useSourceHistory(RECOVERY?.source ?? DEFAULT_SOURCE);
  const [mode, setMode] = useState<Mode>("auto");
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<Selection>([]);
  const [pendingPort, setPendingPort] = useState<PendingPort>(null);
  const [viewport, setViewport] = useState({ panX: 40, panY: 40, zoom: 1 });
  const fitRef = useRef<(() => void) | null>(null);
  const [layersQuery, setLayersQuery] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [toast, setToast] = useState<string | null>(RECOVERY ? "Draft restored" : null);
  const skipDraftSaveRef = useRef(false);
  const lastGoodRef = useRef<{
    doc: DiagramDocument;
    layout: LayoutResult;
    svg: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const sourceCommitTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compiled = useMemo(() => {
    try {
      const doc = parseArch(source);
      const catalog = getCatalogMap();
      const issues = validateDocument(doc, catalog);
      if (hasErrors(issues)) {
        return {
          ok: false as const,
          issues,
          svg: null,
          invariantFailures: [],
        };
      }
      const placedLayout = layoutDocument(doc);
      const edges = routeEdges(doc, placedLayout);
      const layout = attachRoutes(placedLayout, edges);
      const svg = renderSvg(doc, layout, {
        resolveIconHref: (p) => catalogIconUrl(p),
      });
      return {
        ok: true as const,
        issues,
        invariantFailures: [],
        doc,
        layout,
        svg,
      };
    } catch (e) {
      return {
        ok: false as const,
        parseError: (e as Error).message,
        issues: [],
        svg: null,
        layout: null,
        invariantFailures: [],
      };
    }
  }, [source]);

  useEffect(() => {
    if (compiled.ok) lastGoodRef.current = compiled;
  }, [compiled]);

  useEffect(() => {
    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }
    saveDraft(source);
  }, [source]);

  const displayCompiled = compiled.ok ? compiled : lastGoodRef.current;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (compiled.ok) setTitleDraft(compiled.doc.title ?? compiled.doc.id);
  }, [compiled.ok, compiled.ok ? compiled.doc.title : "", compiled.ok ? compiled.doc.id : ""]);

  const selectItem = (item: SelectionItem, additive: boolean) => {
    setSelection((current) => toggleSelectionItem(current, item, additive));
  };

  const issues = useMemo(() => {
    if ("parseError" in compiled && compiled.parseError) {
      return [{ message: compiled.parseError }];
    }
    if (!compiled.ok) {
      return compiled.issues.map((i) => ({ message: i.message }));
    }
    return compiled.invariantFailures;
  }, [compiled]);

  const updateDocument = (doc: DiagramDocument) => commitSource(printArch(doc));

  const previewMutate = (change: (doc: DiagramDocument) => DiagramDocument) => {
    try {
      replaceSource(printArch(change(parseArch(source))));
    } catch {
      // Keep the source editor authoritative while it contains parse errors.
    }
  };

  const mutateCurrent = (change: (doc: DiagramDocument) => DiagramDocument) => {
    try {
      commitSource(printArch(change(parseArch(source))));
    } catch {
      // Keep the source editor authoritative while it contains parse errors.
    }
  };

  const onSourceChange = (next: string) => {
    replaceSource(next);
    if (sourceCommitTimerRef.current) {
      window.clearTimeout(sourceCommitTimerRef.current);
    }
    sourceCommitTimerRef.current = window.setTimeout(() => {
      commitSource(next);
      sourceCommitTimerRef.current = null;
    }, 600);
  };

  const onSourceCommit = () => {
    if (sourceCommitTimerRef.current) {
      window.clearTimeout(sourceCommitTimerRef.current);
      sourceCommitTimerRef.current = null;
    }
    commitSource(source);
  };

  const autoLayout = () => {
    mutateCurrent(clearView);
    setMode("auto");
    setPendingPort(null);
  };

  const selectMarquee = (rect: { x: number; y: number; w: number; h: number }) => {
    if (!compiled.ok) return;
    const hits: Selection = [];
    for (const node of compiled.layout.nodes) {
      if (intersects(rect, node.obstacle)) hits.push({ kind: "resource", id: node.id });
    }
    for (const group of compiled.layout.groups) {
      if (intersects(rect, group.bounds)) hits.push({ kind: "group", id: group.id });
    }
    setSelection(hits);
  };

  const addCatalogResource = (entry: CatalogEntry) => {
    if (!compiled.ok) return;
    const parent = primarySelection(selection)?.kind === "group"
      ? primarySelection(selection)!.id
      : undefined;
    const placement = canPlaceCatalogEntry(compiled.doc, entry, parent);
    if (!placement.ok) {
      setToast(placement.reason ?? "Choose a compatible parent group first.");
      return;
    }
    const at = insertionPoint(compiled.layout, parent);
    try {
      const result = addResource(compiled.doc, entry, parent, at);
      updateDocument(result.doc);
      setMode("manual");
      setSelection([{ kind: "resource", id: result.id }]);
      setTool("select");
    } catch (error) {
      setToast((error as Error).message);
    }
  };

  const addNote = () => {
    if (!compiled.ok) return;
    const at = insertionPoint(compiled.layout);
    const result = addAnnotation(compiled.doc, "Note", at);
    updateDocument(result.doc);
    setMode("manual");
    setSelection([{ kind: "annotation", id: result.id }]);
    setTool("select");
  };

  const choosePort = (nodeId: string, side: Side) => {
    if (!compiled.ok) return;
    setMode("manual");
    if (!pendingPort || pendingPort.nodeId === nodeId) {
      setPendingPort({ nodeId, side });
      setSelection([{ kind: "resource", id: nodeId }]);
      return;
    }
    const result = addEdge(
      compiled.doc,
      pendingPort.nodeId,
      nodeId,
      pendingPort.side,
      side,
    );
    updateDocument(result.doc);
    setPendingPort(null);
    setSelection([{ kind: "edge", id: result.id }]);
    setTool("select");
  };

  const copySelection = async () => {
    if (!compiled.ok || selection.length === 0) return;
    const payload = serializeClipboard(compiled.doc, selection);
    await navigator.clipboard.writeText(payload);
    setToast("Copied selection");
  };

  const pasteSelection = async () => {
    if (!compiled.ok) return;
    try {
      const payload = await navigator.clipboard.readText();
      const at = insertionPoint(compiled.layout);
      const result = pasteClipboard(compiled.doc, payload, at);
      updateDocument(result.doc);
      setSelection(result.selection);
      setToast("Pasted selection");
    } catch {
      setToast("Paste failed");
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("textarea, input, select, [contenteditable='true']") || target.closest(".cm-editor")) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (event.key === "Escape") {
        setPendingPort(null);
        setSelection([]);
        setContextMenu(null);
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selection.length) {
        event.preventDefault();
        mutateCurrent((doc) => deleteSelection(doc, selection));
        setSelection([]);
      }
      if (mod && event.key.toLowerCase() === "a") {
        event.preventDefault();
        if (!compiled.ok) return;
        const all: Selection = [
          ...compiled.doc.resources.map((resource) => ({
            kind: "resource" as const,
            id: resource.id,
          })),
          ...compiled.doc.groups.map((group) => ({
            kind: "group" as const,
            id: group.id,
          })),
          ...compiled.doc.edges.map((edge) => ({ kind: "edge" as const, id: edge.id })),
          ...compiled.doc.annotations.map((annotation) => ({ kind: "annotation" as const, id: annotation.id })),
        ];
        setSelection(all);
      }
      if (mod && event.key.toLowerCase() === "c") {
        event.preventDefault();
        void copySelection();
      }
      if (mod && event.key.toLowerCase() === "v") {
        event.preventDefault();
        void pasteSelection();
        return;
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        if (!compiled.ok || !selection.length) return;
        const result = duplicateSelection(compiled.doc, selection);
        updateDocument(result.doc);
        setSelection(result.selection);
        setMode("manual");
        return;
      }
      if (event.key.toLowerCase() === "v" && !mod) setTool("select");
      if (event.key.toLowerCase() === "c" && !mod) setTool("connector");
      if (selection.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 32 : 8;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        mutateCurrent((doc) => nudgeSelection(doc, selection, dx, dy));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, source, undo, redo, compiled]);

  return (
    <div className="app">
      <section className="canvas-pane">
        <CanvasStage
          viewport={viewport}
          onViewportChange={setViewport}
          onFitRequest={(fit) => {
            fitRef.current = fit;
          }}
          onBackgroundClick={() => {
            setSelection([]);
            if (tool !== "connector") setPendingPort(null);
          }}
        >
          {displayCompiled?.svg ? (
            <>
              <div
                className="diagram-svg"
                dangerouslySetInnerHTML={{ __html: displayCompiled.svg }}
              />
              {compiled.ok && <InteractionOverlay
                doc={compiled.doc}
                layout={compiled.layout}
                mode={mode}
                tool={tool}
                zoom={viewport.zoom}
                selection={selection}
                pendingPort={pendingPort}
                ghostRoute={null}
                onSelect={selectItem}
                onMarquee={selectMarquee}
                onBackgroundClick={() => {
                  setSelection([]);
                  if (tool !== "connector") setPendingPort(null);
                }}
                onChoosePort={choosePort}
                onReconnect={(edgeId, endpoint, nodeId, side) => {
                  mutateCurrent((doc) =>
                    reconnectEdge(
                      doc,
                      edgeId,
                      endpoint === "source"
                        ? { source: nodeId, sourcePort: side }
                        : { target: nodeId, targetPort: side },
                    ),
                  );
                }}
                onGestureBegin={beginTransaction}
                onGestureEnd={endTransaction}
                onMove={(kind, id, x, y, dx, dy) => {
                  if (mode !== "manual") setMode("manual");
                  previewMutate((doc) => {
                    const item = { kind, id } as SelectionItem;
                    const active = selection.some((candidate) => candidate.kind === kind && candidate.id === id)
                      ? selection
                      : [item];
                    return moveSelection(doc, active, dx, dy, compiled.layout);
                  });
                }}
                onResize={(kind, id, w, h, unlockAspect) => {
                  if (mode !== "manual") setMode("manual");
                  previewMutate((doc) =>
                    setSize(doc, id, w, h, { unlockAspect }),
                  );
                }}
                onRoute={(edgeId, points) =>
                  previewMutate((doc) => setRoute(doc, edgeId, points))
                }
                onContextMenu={(clientX, clientY, item) => {
                  setContextMenu({ x: clientX, y: clientY, item });
                }}
              />}
            </>
          ) : (
            <div className="empty-canvas">
              No valid diagram to preview yet.
            </div>
          )}
        </CanvasStage>
        {!compiled.ok && displayCompiled && (
          <div className="source-error-banner" role="alert">
            <strong>Source error — showing the last valid diagram.</strong>
            <span>{issues[0]?.message}</span>
          </div>
        )}

        <header className="floating-topbar">
          <div className="topbar-left">
            <span className="brand-mark">D</span>
            <span className="brand-name">DumbDiagrams</span>
            <input
              className="title-input"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                if (!compiled.ok) return;
                mutateCurrent((doc) => setTitle(doc, titleDraft));
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-label="Diagram title"
            />
            <span className="file-name">.arch</span>
          </div>
          <div className="topbar-center">
            <SegmentedControl
              aria-label="Layout mode"
              value={mode}
              options={[
                { value: "auto", label: "Auto" },
                { value: "manual", label: "Manual" },
              ]}
              onChange={(next) => {
                if (next === "auto") autoLayout();
                else setMode("manual");
              }}
            />
          </div>
          <div className="topbar-right">
            <span className={`status-pill ${issues.length ? "has-errors" : ""}`}>
              {issues.length
                ? `${issues.length} issue${issues.length === 1 ? "" : "s"}`
                : "Valid"}
            </span>
            <div className="history-controls">
              <button
                type="button"
                className="icon-button"
                onClick={undo}
                disabled={!canUndo}
                title="Undo (⌘Z)"
                aria-label="Undo"
              >
                <IconUndo />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={redo}
                disabled={!canRedo}
                title="Redo (⌘⇧Z)"
                aria-label="Redo"
              >
                <IconRedo />
              </button>
            </div>
            <ThemeControl />
            <div className="topbar-group">
              <button
                type="button"
                className="icon-button"
                onClick={() => fileInputRef.current?.click()}
                title="Open .arch"
                aria-label="Open .arch"
              >
                <IconOpen />
              </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".arch,text/plain"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                try {
                  const imported = parseArch(text);
                  const importIssues = validateDocument(imported, getCatalogMap());
                  if (hasErrors(importIssues)) {
                    setToast("Import rejected: the document is invalid.");
                    return;
                  }
                  skipDraftSaveRef.current = true;
                  commitSource(text);
                  clearDraft();
                  setSelection([]);
                  setPendingPort(null);
                  setViewport({ panX: 40, panY: 40, zoom: 1 });
                  setToast(`Opened ${file.name}`);
                } catch (error) {
                  setToast(`Import rejected: ${(error as Error).message}`);
                } finally {
                  event.currentTarget.value = "";
                }
              }}
            />
            {compiled.ok ? (
              <ExportMenu
                title={compiled.doc.title ?? compiled.doc.id}
                svg={compiled.svg}
                source={source}
                getPortableSvg={() => renderPortableSvg(compiled.doc, compiled.layout)}
                onToast={setToast}
              />
            ) : (
              <button type="button" className="primary-button" disabled>
                Download SVG
              </button>
            )}
            </div>
          </div>
        </header>

        <ToolDock
          active={tool}
          onChange={(next) => {
            if (next === "note") {
              addNote();
              return;
            }
            setTool(next);
            if (next === "connector") setMode("manual");
            else setPendingPort(null);
          }}
        />

        {tool === "resources" && (
          <FloatingPanel
            className="drawer-sheet asset-sheet"
            title="Resources"
            subtitle="Browse services by provider and category"
            onClose={() => setTool("select")}
            width={420}
          >
            <AssetBrowser
              mode="resources"
              onAddService={addCatalogResource}
              onAddGroup={() => {}}
              onImportSvg={async (file) => {
                if (!compiled.ok) return;
                try {
                  const text = await file.text();
                  const imported = importSvgAsset(compiled.doc, text);
                  const placed = addCustomResource(
                    imported.doc,
                    imported.assetId,
                    file.name.replace(/\.svg$/i, ""),
                    primarySelection(selection)?.kind === "group"
                      ? primarySelection(selection)!.id
                      : undefined,
                    insertionPoint(compiled.layout),
                  );
                  updateDocument(placed.doc);
                  setSelection([{ kind: "resource", id: placed.id }]);
                  setToast(`Imported ${file.name}`);
                } catch (error) {
                  setToast((error as Error).message);
                }
              }}
            />
          </FloatingPanel>
        )}

        {tool === "groups" && (
          <FloatingPanel
            className="drawer-sheet asset-sheet"
            title="Groups"
            subtitle="Infrastructure boundaries by provider"
            onClose={() => setTool("select")}
            width={380}
          >
            <AssetBrowser
              mode="groups"
              onAddService={() => {}}
              onAddGroup={(entry, kind) => {
                if (!compiled.ok) return;
                const parent = primarySelection(selection)?.kind === "group"
                  ? primarySelection(selection)!.id
                  : undefined;
                try {
                  const result = addGroup(
                    compiled.doc,
                    kind,
                    entry.name,
                    parent,
                    insertionPoint(compiled.layout, parent),
                    entry.type,
                  );
                  updateDocument(result.doc);
                  setMode("manual");
                  setSelection([{ kind: "group", id: result.id }]);
                  setTool("select");
                } catch (error) {
                  setToast((error as Error).message);
                }
              }}
              onImportSvg={() => {}}
            />
          </FloatingPanel>
        )}

        {tool === "connector" && (
          <FloatingPanel
            className="drawer-sheet"
            title="Connector"
            subtitle="Pick ports on two icons"
            onClose={() => setTool("select")}
            width={280}
          >
            <ConnectorDrawer pendingPort={pendingPort} />
          </FloatingPanel>
        )}

        {compiled.ok &&
          selection.some((item) => item.kind === "edge") &&
          tool !== "resources" &&
          tool !== "groups" &&
          tool !== "code" &&
          tool !== "layers" && (
            <FloatingPanel
              className="drawer-sheet edge-sheet"
              title="Connector"
              subtitle="Style and routing"
              onClose={() =>
                setSelection((current) => current.filter((item) => item.kind !== "edge"))
              }
              width={300}
            >
              {(() => {
                const edgeItem = selection.find((item) => item.kind === "edge");
                const edge = edgeItem
                  ? compiled.doc.edges.find((candidate) => candidate.id === edgeItem.id)
                  : undefined;
                if (!edge || !edgeItem) return null;
                const routePinned = Boolean(compiled.doc.views[0]?.routes[edge.id]?.pin);
                return (
                  <EdgePanel
                    edge={edge}
                    routePinned={routePinned}
                    onUpdateEdge={(style, kind) =>
                      mutateCurrent((doc) => updateEdge(doc, edge.id, { style, kind }))
                    }
                    onPinRoute={() => {
                      const edgeGeom = compiled.layout.edges.find(
                        (candidate) => candidate.id === edge.id,
                      );
                      if (!edgeGeom) return;
                      setMode("manual");
                      mutateCurrent((doc) =>
                        setRoute(doc, edge.id, createOrthogonalRoute(edgeGeom.points)),
                      );
                    }}
                    onAutoRoute={() => mutateCurrent((doc) => clearRoute(doc, edge.id))}
                    onSwapDirection={() =>
                      mutateCurrent((doc) => swapEdgeDirection(doc, edge.id))
                    }
                    onDelete={() => {
                      mutateCurrent((doc) => deleteSelection(doc, [edgeItem]));
                      setSelection((current) =>
                        current.filter((item) => item.kind !== "edge"),
                      );
                    }}
                  />
                );
              })()}
            </FloatingPanel>
          )}

        {tool === "code" && (
          <FloatingPanel
            className="drawer-sheet source-sheet"
            title="Source"
            subtitle="Valid edits sync to the canvas"
            onClose={() => setTool("select")}
            width={520}
          >
            <SourceDrawer
              source={source}
              issues={issues}
              onChange={onSourceChange}
              onCommit={onSourceCommit}
              onFormat={() => {
                try {
                  commitSource(printArch(parseArch(source)));
                  setToast("Formatted source");
                } catch {
                  setToast("Cannot format invalid source");
                }
              }}
              onReset={() => {
                skipDraftSaveRef.current = true;
                resetHistory(DEFAULT_SOURCE);
                clearDraft();
                setMode("auto");
                setSelection([]);
                setPendingPort(null);
                setToast("Draft cleared");
              }}
            />
          </FloatingPanel>
        )}

        {tool === "layers" && compiled.ok && (
          <FloatingPanel
            className="drawer-sheet layers-sheet"
            title="Layers"
            subtitle="Hierarchy, visibility, and lock"
            onClose={() => setTool("select")}
            width={320}
          >
            <LayersPanel
              doc={compiled.doc}
              selection={selection}
              query={layersQuery}
              onQuery={setLayersQuery}
              onSelect={selectItem}
              onToggleVisible={(item) => {
                mutateCurrent((doc) => {
                  const view = doc.views[0]!;
                  const place =
                    item.kind === "annotation"
                      ? view.annotations?.[item.id]
                      : view.places[item.id];
                  return setVisible(doc, item.kind, item.id, place?.visible === false);
                });
              }}
              onToggleLocked={(item) => {
                mutateCurrent((doc) => {
                  const view = doc.views[0]!;
                  const place =
                    item.kind === "annotation"
                      ? view.annotations?.[item.id]
                      : view.places[item.id];
                  return setLocked(doc, item.kind, item.id, !place?.locked);
                });
              }}
            />
          </FloatingPanel>
        )}

        {selection.length > 0 && compiled.ok && !selection.some((item) => item.kind === "edge") && (
          <Inspector
            doc={compiled.doc}
            layout={compiled.layout}
            selection={selection}
            onRename={(label) => {
              const item = primarySelection(selection);
              if (!item) return;
              mutateCurrent((doc) => {
                if (item.kind === "resource") return renameResource(doc, item.id, label);
                if (item.kind === "group") return renameGroup(doc, item.id, label);
                if (item.kind === "edge") return renameEdge(doc, item.id, label);
                if (item.kind === "annotation") return updateAnnotationText(doc, item.id, label);
                return doc;
              });
            }}
            onAlign={(axis) =>
              mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout!, axis))
            }
            onDistribute={(axis) =>
              mutateCurrent((doc) =>
                distributeSelection(doc, selection, compiled.layout!, axis),
              )
            }
            onSetIconSize={(size) => {
              const resource = selection.find((item) => item.kind === "resource");
              if (!resource) return;
              mutateCurrent((doc) => setResourceIconSize(doc, resource.id, size));
            }}
            onUpdateEdge={(style, kind) => {
              const edge = selection.find((item) => item.kind === "edge");
              if (!edge) return;
              mutateCurrent((doc) => updateEdge(doc, edge.id, { style, kind }));
            }}
            onPinRoute={() => {
              const edgeItem = selection.find((item) => item.kind === "edge");
              const edge = edgeItem
                ? compiled.layout.edges.find((candidate) => candidate.id === edgeItem.id)
                : undefined;
              if (edge) {
                setMode("manual");
                mutateCurrent((doc) =>
                  setRoute(doc, edge.id, createOrthogonalRoute(edge.points)),
                );
              }
            }}
            onAutoRoute={() => {
              const edge = selection.find((item) => item.kind === "edge");
              if (!edge) return;
              mutateCurrent((doc) => clearRoute(doc, edge.id));
            }}
            onDelete={() => {
              mutateCurrent((doc) => deleteSelection(doc, selection));
              setSelection([]);
            }}
            onClose={() => setSelection([])}
          />
        )}

        {selection.length > 1 && compiled.ok && (
          <div className="context-toolbar">
            <button type="button" onClick={() => mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout!, "left"))}>Align left</button>
            <button type="button" onClick={() => mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout!, "center"))}>Center</button>
            <button type="button" onClick={() => mutateCurrent((doc) => distributeSelection(doc, selection, compiled.layout!, "horizontal"))}>Distribute</button>
            <button type="button" onClick={addNote}>Add note</button>
          </div>
        )}

        <div className="status-capsule">
          <button type="button" onClick={() => fitRef.current?.()} title="Fit to screen">
            <IconFit />
          </button>
          <button type="button" onClick={() => setViewport((v) => ({ ...v, zoom: 1 }))}>100%</button>
          <button type="button" onClick={() => setViewport((v) => ({ ...v, zoom: clampZoom(v.zoom + 0.1) }))}>+</button>
          <button type="button" onClick={() => setViewport((v) => ({ ...v, zoom: clampZoom(v.zoom - 0.1) }))}>−</button>
          <span>{mode === "manual" ? "Manual" : "Auto layout"}</span>
          <span>{Math.round(viewport.zoom * 100)}%</span>
        </div>

        {toast && <div className="toast" role="status">{toast}</div>}

        {contextMenu && compiled.ok && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            items={buildContextMenuItems(
              contextMenu.item,
              mode,
              compiled.doc,
              (change) => mutateCurrent(change),
              () => {
                const result = duplicateSelection(compiled.doc, [contextMenu.item]);
                updateDocument(result.doc);
                setSelection(result.selection);
                setMode("manual");
              },
              () =>
                setSelection((current) =>
                  current.filter(
                    (candidate) =>
                      candidate.kind !== contextMenu.item.kind ||
                      candidate.id !== contextMenu.item.id,
                  ),
                ),
            )}
          />
        )}

      </section>
    </div>
  );
}

function ConnectorDrawer({ pendingPort }: { pendingPort: PendingPort }) {
  return (
    <div className="callout">
      {pendingPort ? (
        <>
          Starting at <strong>{pendingPort.nodeId}</strong> ·{" "}
          {pendingPort.side.toUpperCase()}. Pick a target port.
        </>
      ) : (
        <>Select a source port, then a target port on another icon.</>
      )}
    </div>
  );
}

function Inspector({
  doc,
  layout,
  selection,
  onRename,
  onAlign,
  onDistribute,
  onSetIconSize,
  onUpdateEdge,
  onPinRoute,
  onAutoRoute,
  onDelete,
  onClose,
}: {
  doc: DiagramDocument;
  layout: LayoutResult;
  selection: Selection;
  onRename: (label: string) => void;
  onAlign: (axis: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onSetIconSize: (size: ResourceIconSize) => void;
  onUpdateEdge: (style: EdgeStyle, kind: EdgeKind) => void;
  onPinRoute: () => void;
  onAutoRoute: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const item = primarySelection(selection);
  const edge = item?.kind === "edge"
    ? doc.edges.find((candidate) => candidate.id === item.id)
    : undefined;
  const resource = item?.kind === "resource"
    ? doc.resources.find((candidate) => candidate.id === item.id)
    : undefined;
  const group = item?.kind === "group"
    ? doc.groups.find((candidate) => candidate.id === item.id)
    : undefined;
  const annotation = item?.kind === "annotation"
    ? doc.annotations.find((candidate) => candidate.id === item.id)
    : undefined;
  const routePinned = Boolean(item && doc.views[0]?.routes[item.id]?.pin);

  const title =
    resource?.label.role ??
    resource?.label.service ??
    group?.label ??
    edge?.label ??
    annotation?.text ??
    edge?.id ??
    item?.id ??
    `${selection.length} selected`;

  const [labelDraft, setLabelDraft] = useState(title);
  useEffect(() => setLabelDraft(title), [title]);

  return (
    <FloatingPanel
      className="inspector-sheet"
      title={title}
      subtitle={selection.length > 1 ? `${selection.length} items` : item?.kind ?? "selection"}
      onClose={onClose}
      width={280}
    >
      {selection.length > 1 && (
        <div className="property-section">
          <label>Alignment</label>
          <div className="button-grid">
            <button type="button" onClick={() => onAlign("left")}>Left</button>
            <button type="button" onClick={() => onAlign("center")}>Center</button>
            <button type="button" onClick={() => onAlign("right")}>Right</button>
            <button type="button" onClick={() => onAlign("top")}>Top</button>
            <button type="button" onClick={() => onAlign("middle")}>Middle</button>
            <button type="button" onClick={() => onAlign("bottom")}>Bottom</button>
          </div>
          <div className="button-pair">
            <button type="button" onClick={() => onDistribute("horizontal")}>Distribute H</button>
            <button type="button" onClick={() => onDistribute("vertical")}>Distribute V</button>
          </div>
        </div>
      )}
      {(resource || group || edge || annotation) && (
        <div className="property-section">
          <label htmlFor="inspector-label">Display label</label>
          <input
            id="inspector-label"
            value={labelDraft}
            onChange={(event) => setLabelDraft(event.target.value)}
            onBlur={() => onRename(labelDraft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </div>
      )}
      {resource && (
        <div className="property-section">
          <label>Icon size</label>
          <div className="button-pair">
            <button
              type="button"
              className={resourceIconSize(resource) === "normal" ? "is-active" : ""}
              onClick={() => onSetIconSize("normal")}
            >
              Normal ({GRAMMAR.iconPrimary}px)
            </button>
            <button
              type="button"
              className={resourceIconSize(resource) === "small" ? "is-active" : ""}
              onClick={() => onSetIconSize("small")}
            >
              Small ({GRAMMAR.iconSecondary}px)
            </button>
          </div>
          <label>Resource type</label>
          <div className="readonly-value">{resource.type}</div>
          <label>Parent</label>
          <div className="readonly-value">{resource.parent ?? "Canvas"}</div>
        </div>
      )}
      {group && (
        <div className="property-section">
          <label>Group kind</label>
          <div className="readonly-value">{group.kind}</div>
          <label>Children</label>
          <div className="readonly-value">{group.children.length}</div>
        </div>
      )}
      {edge && (
        <>
          <div className="property-section">
            <label>Line style</label>
            <div className="button-pair">
              {(["solid", "dashed"] as EdgeStyle[]).map((style) => (
                <button
                  key={style}
                  className={edge.style === style ? "is-active" : ""}
                  type="button"
                  onClick={() => onUpdateEdge(style, edge.kind ?? "flow")}
                >
                  {style}
                </button>
              ))}
            </div>
            <label htmlFor="edge-kind">Meaning</label>
            <select
              id="edge-kind"
              value={edge.kind ?? "flow"}
              onChange={(event) =>
                onUpdateEdge(edge.style, event.target.value as EdgeKind)
              }
            >
              <option value="flow">Flow</option>
              <option value="peer">Peer</option>
              <option value="fail">Failure</option>
            </select>
          </div>
          <div className="property-section">
            <label>Route</label>
            <button className="wide-button" type="button" onClick={routePinned ? onAutoRoute : onPinRoute}>
              {routePinned ? "Use auto route" : "Edit route manually"}
            </button>
          </div>
        </>
      )}
      <div className="inspector-footer">
        <button className="danger-button" type="button" onClick={onDelete}>Delete</button>
      </div>
    </FloatingPanel>
  );
}

function insertionPoint(layout: LayoutResult, parent?: string): Point {
  const group = parent
    ? layout.groups.find((candidate) => candidate.id === parent)
    : undefined;
  if (group) {
    return {
      x: group.content.x + Math.max(24, group.content.w / 2 - 40),
      y: group.content.y + Math.max(24, group.content.h / 2 - 40),
    };
  }
  return {
    x: Math.max(48, layout.width / 2 - 40),
    y: Math.max(48, layout.height / 2 - 40),
  };
}

function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function snap(value: number): number {
  return Math.round(value / 8) * 8;
}

function buildContextMenuItems(
  item: SelectionItem,
  mode: Mode,
  doc: DiagramDocument,
  mutate: (change: (doc: DiagramDocument) => DiagramDocument) => void,
  onDuplicate: () => void,
  onDeleted: () => void,
) {
  const view = doc.views[0];
  const place =
    item.kind === "annotation"
      ? view?.annotations?.[item.id]
      : view?.places[item.id];
  const locked = Boolean(place?.locked);
  const manual = mode === "manual";
  const canLayer = manual;

  const items = [];

  items.push({
    id: "duplicate",
    label: "Duplicate",
    onSelect: onDuplicate,
  });

  if (canLayer) {
    items.push({
      id: "front",
      label: "Send to front",
      onSelect: () => mutate((next) => sendToFront(next, item.id)),
    });
    items.push({
      id: "back",
      label: "Send to back",
      onSelect: () => mutate((next) => sendToBack(next, item.id)),
    });
  }

  if (manual) {
    items.push({
      id: "lock",
      label: locked ? "Unlock" : "Lock position",
      onSelect: () =>
        mutate((next) =>
          setLocked(
            next,
                    item.kind as "resource" | "group" | "edge" | "annotation",
            item.id,
            !locked,
          ),
        ),
    });
  }

  if (item.kind === "edge") {
    items.push({
      id: "delete",
      label: "Delete connector",
      onSelect: () => {
        mutate((next) => deleteSelection(next, [item]));
        onDeleted();
      },
    });
  } else {
    items.push({
      id: "delete",
      label: "Delete",
      onSelect: () => {
        mutate((next) => deleteSelection(next, [item]));
        onDeleted();
      },
    });
  }

  return items;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
