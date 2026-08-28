import { lazy, memo, startTransition, StrictMode, Suspense, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ClipboardEvent as ReactClipboardEvent, type DragEvent as ReactDragEvent } from "react";
import { createRoot } from "react-dom/client";

import type {
  AnnotationStyle,
  BoundaryFill,
  DiagramDocument,
  EdgeColor,
  EdgeKind,
  EdgeStyle,
  GroupKind,
  GroupLabelPosition,
  LayoutResult,
  Point,
  ResourceLabelPosition,
  Side,
  TextAlign,
  TextFontFamily,
} from "@dumb-diagrams/runtime/core";
import {
  createEmptyDocument,
  characterLength,
  DIAGRAM_LIMITS,
  EDGE_COLOR_VALUES,
  hasErrors,
  normalizeMultilineText,
  normalizeSingleLineText,
  utf8ByteLength,
  validateDocument,
} from "@dumb-diagrams/runtime/core";
import {
  getCatalogMap,
  getCatalogEntry,
  catalogIconUrl,
  type CatalogEntry,
} from "@dumb-diagrams/runtime/catalog";
import { parseDgm, printDgm } from "@dumb-diagrams/runtime/dsl";
import { layoutDocument } from "@dumb-diagrams/runtime/layout";
import { GRAMMAR } from "@dumb-diagrams/runtime/grammar-aws";
import { renderPortableSvg, renderSvg, sanitizeSvg } from "@dumb-diagrams/runtime/render";
import { routeEdges, attachRoutes, normalizeOrthogonalRoute } from "@dumb-diagrams/runtime/route";

import {
  addAnnotation,
  addText,
  ANNOTATION_STYLES,
  annotationSize,
  annotationStyle,
  addEdge,
  addGroup,
  addResource,
  alignSelection,
  clearRoute,
  clearView,
  deleteSelection,
  distributeSelection,
  nudgeSelection,
  pasteClipboard,
  primarySelection,
  reconnectEdge,
  renameEdge,
  renameGroup,
  renameResource,
  updateGroupStep,
  resourceIconSize,
  serializeClipboard,
  setResourceIconSize,
  setResourceLabelPosition,
  setGroupLabelPosition,
  setGroupIconHidden,
  setBoundaryAppearance,
  setRoute,
  setSize,
  setPlace,
  setTitle,
  setLocked,
  setVisible,
  sendToFront,
  sendToBack,
  setEdgeBadgePosition,
  setEdgeLabelPosition,
  swapEdgeDirection,
  toggleSelectionItem,
  updateEdge,
  updateEdgePreservingLayout,
  addCustomResource,
  canPlaceCatalogEntry,
  duplicateSelection,
  importSvgAsset,
  moveSelection,
  needsAutoFix,
  updateAnnotationText,
  updateTextFormat,
  setAnnotationStyle,
  type Selection,
  type SelectionItem,
  type ResourceIconSize,
  MAX_EDGE_STEP,
} from "./editor-model";
import {
  CanvasStage,
  clampZoom,
  defaultViewportForContent,
} from "./canvas/CanvasStage";
import { InteractionOverlay } from "./interactions/InteractionOverlay";
import {
  CATALOG_DRAG_MIME,
  parseCatalogDragPayload,
} from "./catalog-dnd";
import { AssetBrowser } from "./panels/AssetBrowser";
import { ContextMenu, type ContextMenuItem } from "./panels/ContextMenu";
import { EdgePanel } from "./panels/EdgePanel";
import { ExportDialog } from "./panels/ExportDialog";
import { ExportMenu } from "./panels/ExportMenu";
import { HelpModal } from "./panels/HelpModal";
import { CommandPalette, type Command } from "./panels/CommandPalette";
import type { DiagramExample } from "./examples";
import { LayersPanel } from "./panels/LayersPanel";
import { ProjectFilesModal } from "./panels/ProjectFilesModal";
import { RecycleBinModal } from "./panels/RecycleBinModal";
import { WorkspaceTabs } from "./panels/WorkspaceTabs";
import { clearDraft, loadDraft } from "./state/autosave";
import {
  downloadText,
  exportDgmFile,
  filenameWithExtension,
  type ExportFormat,
} from "./state/export-actions";
import {
  isTabDirty,
  MAX_WORKSPACE_TABS,
  normalizeWorkspacePreview,
  useWorkspace,
  type WorkspacePreviewMap,
  type WorkspaceTab,
} from "./state/workspace";
import { FloatingPanel } from "./ui/FloatingPanel";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Modal } from "./ui/Modal";
import { TopMenu, type TopMenuItem } from "./ui/TopMenu";
import {
  IconEdit,
  IconFit,
  IconGrid,
  IconHelp,
  IconLock,
  IconMagicWand,
  IconMenu,
  IconRedo,
  IconUndo,
} from "./ui/icons";
import { ThemeControl } from "./ui/ThemeControl";
import { ToolDock, type ToolId } from "./ui/ToolDock";
import { initTheme } from "./ui/theme";
import { useDiagramCompilation } from "./use-diagram-compilation";
import {
  GRID_SIZE,
  leftStagingInsertionPoint,
  snapLayoutToGrid,
  snapPoint,
} from "./grid.js";
import asyncDocsSource from "../../../examples/diagrams/async-docs.dgm?raw";
import "./styles.css";

initTheme();

const DEFAULT_SOURCE = asyncDocsSource;
const BLANK_SOURCE = printDgm(createEmptyDocument("untitled-diagram"));
const INITIAL_VIEWPORT = defaultViewportForContent(0, 0);
const TAB_CLOSE_FALLBACK_MS = 500;
const LEFT_DRAWER_WIDTH = 420;
const STUDIO_ACCESS_TOKEN = new URLSearchParams(window.location.search).get("token");

function studioApiPath(pathname: string): string {
  if (!STUDIO_ACCESS_TOKEN) return pathname;
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set("token", STUDIO_ACCESS_TOKEN);
  return `${url.pathname}${url.search}`;
}

function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read clipboard image"));
    reader.readAsDataURL(blob);
  });
}

async function rasterDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

const RenderedDiagram = memo(function RenderedDiagram({ svg }: { svg: string }) {
  return <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
});

const SourceDrawer = lazy(() => import("./panels/SourceDrawer").then((module) => ({
  default: module.SourceDrawer,
})));
const ExamplesModal = lazy(() => import("./panels/ExamplesModal").then((module) => ({
  default: module.ExamplesModal,
})));
const RECOVERY = (() => {
  const draft = loadDraft();
  if (!draft) return null;
  try {
    const doc = parseDgm(draft.source);
    if (hasErrors(validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false }))) {
      clearDraft();
      return null;
    }
    return draft;
  } catch {
    clearDraft();
    return null;
  }
})();
type Tool = ToolId;
type PendingPort = { nodeId: string; side: Side; offset: number } | null;
type ContextMenuState = { x: number; y: number; selection: Selection; canvasPoint?: Point } | null;
type TabContextMenuState = { x: number; y: number; tabId: string } | null;
type BulkCloseRequest = {
  kind: "all" | "right";
  tabId: string;
  tabCount: number;
  dirtyCount: number;
} | null;
type OperationState = { label: string } | null;
type LocalStudioPayload = {
  source: string;
  revision: string;
  fileName: string;
  filePath: string;
};
type LocalStudioState = LocalStudioPayload & {
  status: "connected" | "saving" | "disconnected" | "conflict";
  external?: LocalStudioPayload;
};
type ProjectFilesPayload = {
  files: string[];
};
type CatalogPlacement = {
  parent: string | undefined;
  at: Point;
  manual: boolean;
};

function canvasInteractionTool(tool: Tool): Tool {
  // Drawers are non-modal: opening one should not turn off selection, movement,
  // or canvas gestures. Connector is the only tool with its own canvas mode.
  return tool === "connector" ? "connector" : "select";
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

function documentNameForDisplay(doc: DiagramDocument): string {
  const authoredTitle = doc.title?.trim();
  if (authoredTitle) return authoredTitle;
  const readableId = doc.id
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
  return readableId || "Untitled diagram";
}

function rejectOversizedPaste(
  event: ReactClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  limit: number,
  onReject: () => void,
): void {
  const target = event.currentTarget;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  const next = target.value.slice(0, start) + event.clipboardData.getData("text") + target.value.slice(end);
  if (characterLength(next) <= limit) return;
  event.preventDefault();
  onReject();
}

function App() {
  const {
    ready: workspaceReady,
    tabs,
    activeTab,
    activeTabId,
    recentlyClosed,
    source,
    viewport,
    replaceSource,
    commitSource,
    resetTab,
    resetActive,
    beginTransaction,
    endTransaction,
    undo,
    redo,
    canUndo,
    canRedo,
    setActiveTab,
    reorderTabs,
    openTab,
    newTab,
    closeTab,
    closeAllTabs,
    closeTabsToRight,
    reopenClosed,
    restoreClosed,
    removeClosed,
    clearRecentlyClosed,
    duplicateTab,
    updateViewport,
    markTabSaved,
    setTabFilename,
  } = useWorkspace({
    initialSource: RECOVERY?.source ?? DEFAULT_SOURCE,
    initialSavedSource: RECOVERY ? "" : DEFAULT_SOURCE,
    initialOrigin: RECOVERY ? "recovery" : "fixture",
    initialViewport: INITIAL_VIEWPORT,
    blankSource: BLANK_SOURCE,
  });
  const [tool, setTool] = useState<Tool>("select");
  const interactionTool = canvasInteractionTool(tool);
  const [selection, setSelection] = useState<Selection>([]);
  const [textEditRequest, setTextEditRequest] = useState<SelectionItem | null>(null);
  const [pendingPort, setPendingPort] = useState<PendingPort>(null);
  const [defaultFrameKey, setDefaultFrameKey] = useState(0);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const connectedStudioTabIdRef = useRef<string | null>(null);
  const localStudioRevisionRef = useRef<string | null>(null);
  const [localStudio, setLocalStudio] = useState<LocalStudioState | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const [layersQuery, setLayersQuery] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [noteComposerStyle, setNoteComposerStyle] = useState<AnnotationStyle>("paper");
  const [textDraft, setTextDraft] = useState("Text");
  const [textFont, setTextFont] = useState<TextFontFamily>("sans");
  const [textFontSize, setTextFontSize] = useState(14);
  const [textAlign, setTextAlign] = useState<TextAlign>("left");
  const [toast, setToastMessage] = useState<string | null>(null);
  const [toastNonce, setToastNonce] = useState(0);
  const lastGoodRef = useRef<{
    doc: DiagramDocument;
    layout: LayoutResult;
    svg: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenuState>(null);
  const [bulkCloseRequest, setBulkCloseRequest] = useState<BulkCloseRequest>(null);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const internalClipboardRef = useRef<string | null>(null);
  const sourceCommitTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [openingExampleId, setOpeningExampleId] = useState<string | null>(null);
  const [isExampleOpening, startExampleOpening] = useTransition();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [exportDialogFormat, setExportDialogFormat] = useState<ExportFormat | null>(null);
  const [projectFilesOpen, setProjectFilesOpen] = useState(false);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [projectFilesLoading, setProjectFilesLoading] = useState(false);
  const [projectFilesError, setProjectFilesError] = useState<string | null>(null);
  const [openingProjectFile, setOpeningProjectFile] = useState<string | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsDraft, setSaveAsDraft] = useState("");
  const [closeRequest, setCloseRequest] = useState<string | null>(null);
  const [resetExampleOpen, setResetExampleOpen] = useState(false);
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const closeAnimationTimerRef = useRef<number | null>(null);
  const pendingClosePreviewsRef = useRef<WorkspacePreviewMap>({});
  const [operation, setOperation] = useState<OperationState>(null);

  useEffect(() => {
    return () => {
      if (closeAnimationTimerRef.current !== null) {
        window.clearTimeout(closeAnimationTimerRef.current);
      }
    };
  }, []);

  const setToast = (message: string | null) => {
    if (message !== null) setToastNonce((current) => current + 1);
    setToastMessage(message);
  };

  const refreshProjectFiles = useCallback(async () => {
    setProjectFilesLoading(true);
    setProjectFilesError(null);
    try {
      const response = await fetch(studioApiPath("/api/files"), { headers: { Accept: "application/json" } });
      const payload = await response.json() as Partial<ProjectFilesPayload> & { message?: string };
      if (!response.ok || !Array.isArray(payload.files)) {
        throw new Error(payload.message ?? "The project diagram list could not be loaded.");
      }
      setProjectFiles(payload.files.filter((fileName): fileName is string => typeof fileName === "string"));
    } catch (error) {
      setProjectFilesError(error instanceof Error ? error.message : "The project diagram list could not be loaded.");
    } finally {
      setProjectFilesLoading(false);
    }
  }, []);

  const openProjectFiles = () => {
    if (!localStudio) {
      setToast("Project diagram selection is available when Studio is opened from a local project.");
      return;
    }
    setProjectFilesOpen(true);
    void refreshProjectFiles();
  };

  const selectProjectFile = async (fileName: string) => {
    const connection = localStudio;
    const connectedTabId = connectedStudioTabIdRef.current;
    const connectedTab = connectedTabId ? tabsRef.current.find((tab) => tab.id === connectedTabId) : undefined;
    if (!connection || !connectedTabId) return;
    if (connectedTab && isTabDirty(connectedTab)) {
      setToast("Save the current diagram before switching project files.");
      return;
    }

    setOpeningProjectFile(fileName);
    setProjectFilesError(null);
    try {
      const response = await fetch(studioApiPath("/api/select"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ filename: fileName }),
      });
      const payload = await response.json() as Partial<LocalStudioPayload> & { message?: string };
      if (!response.ok || typeof payload.source !== "string" || !payload.revision || !payload.fileName || !payload.filePath) {
        throw new Error(payload.message ?? "The selected project diagram could not be opened.");
      }

      localStudioRevisionRef.current = payload.revision;
      setActiveTab(connectedTabId);
      resetTab(connectedTabId, payload.source, payload.source, {
        filename: payload.fileName,
        origin: "file",
      });
      setLocalStudio((current) => current
        ? { ...current, ...payload as LocalStudioPayload, status: "connected", external: undefined }
        : current);
      setProjectFilesOpen(false);
      setToast(`Opened ${payload.fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The selected project diagram could not be opened.";
      setProjectFilesError(message);
      setToast(message);
    } finally {
      setOpeningProjectFile(null);
    }
  };

  useEffect(() => {
    if (!localStudio || localStudio.status === "disconnected") return;
    void refreshProjectFiles();
  }, [localStudio?.filePath, localStudio?.status, refreshProjectFiles]);

  useEffect(() => {
    if (!workspaceReady) return;
    let cancelled = false;
    let events: EventSource | null = null;

    const connect = async () => {
      try {
        const sessionResponse = await fetch(studioApiPath("/api/session"), { headers: { Accept: "application/json" } });
        if (!sessionResponse.ok || !sessionResponse.headers.get("content-type")?.includes("application/json")) return;
        const session = await sessionResponse.json() as Partial<LocalStudioPayload>;
        const documentResponse = await fetch(studioApiPath("/api/document"), { headers: { Accept: "application/json" } });
        if (!documentResponse.ok) throw new Error("The local Studio document could not be loaded.");
        const document = await documentResponse.json() as LocalStudioPayload;
        if (cancelled || typeof document.source !== "string" || typeof document.revision !== "string") return;

        connectedStudioTabIdRef.current = activeTabRef.current.id;
        localStudioRevisionRef.current = document.revision;
        resetTab(activeTabRef.current.id, document.source, document.source, {
          filename: document.fileName,
          origin: "file",
        });
        setLocalStudio({
          source: document.source,
          revision: document.revision,
          fileName: document.fileName ?? String(session.fileName ?? "diagram.dgm"),
          filePath: document.filePath ?? String(session.filePath ?? ""),
          status: "connected",
        });
        setToast(`Connected to ${document.fileName}`);

        events = new EventSource(studioApiPath("/api/events"));
        const applyStudioEvent = (next: LocalStudioPayload) => {
          if (cancelled) return;
          if (!next.revision) return;
          if (next.revision === localStudioRevisionRef.current) {
            setLocalStudio((current) => current && current.status !== "conflict"
              ? { ...current, ...next, status: "connected", external: undefined }
              : current);
            return;
          }
          const connectedTab = tabsRef.current.find((tab) => tab.id === connectedStudioTabIdRef.current);
          if (!connectedTab) return;
          const currentTab = connectedTab;
          const isDirty = currentTab.source !== currentTab.savedSource;
          if (isDirty) {
            setLocalStudio((current) => current
              ? { ...current, status: "conflict", external: next }
              : current);
            setToast("The .dgm changed outside Studio");
            return;
          }
          localStudioRevisionRef.current = next.revision;
          resetTab(connectedTab.id, next.source, next.source, {
            filename: next.fileName,
            origin: "file",
          });
          setLocalStudio((current) => current
            ? { ...current, ...next, status: "connected", external: undefined }
            : current);
          setToast(`Updated from ${next.fileName}`);
        };
        events.addEventListener("ready", (event) => {
          applyStudioEvent(JSON.parse((event as MessageEvent).data) as LocalStudioPayload);
        });
        events.addEventListener("document", (event) => {
          applyStudioEvent(JSON.parse((event as MessageEvent).data) as LocalStudioPayload);
        });
        events.addEventListener("document-missing", () => {
          setLocalStudio((current) => current ? { ...current, status: "disconnected" } : current);
          setToast("The connected .dgm file is no longer on disk");
        });
        events.onerror = () => {
          if (!cancelled) setLocalStudio((current) => current ? { ...current, status: "disconnected" } : current);
        };
      } catch {
        // Browser Studio and the static site intentionally have no local API.
      }
    };

    void connect();
    return () => {
      cancelled = true;
      events?.close();
    };
  }, [resetTab, workspaceReady]);

  const tabLabel = useCallback((tab: WorkspaceTab): string => {
    try {
      return documentNameForDisplay(parseDgm(tab.source));
    } catch {
      return tab.filename?.replace(/\.dgm$/i, "") || "Untitled diagram";
    }
  }, []);

  const sourceIsValid = (candidate: string): boolean => {
    try {
      const doc = parseDgm(candidate);
      if (hasErrors(validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false }))) return false;
      for (const asset of doc.assets ?? []) sanitizeSvg(asset.content);
      return true;
    } catch {
      return false;
    }
  };

  const saveToLocalStudio = async (
    tabId: string,
    candidate: string,
    requestedFilename?: string,
  ): Promise<boolean> => {
    const connection = localStudio;
    const baseRevision = localStudioRevisionRef.current;
    if (!connection || !baseRevision) return false;
    setLocalStudio((current) => current ? { ...current, status: "saving" } : current);
    try {
      const response = await fetch(studioApiPath("/api/document"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          source: candidate,
          baseRevision,
          ...(requestedFilename ? { filename: requestedFilename } : {}),
        }),
      });
      const payload = await response.json() as Partial<LocalStudioPayload> & { message?: string; error?: string };
      if (response.status === 409 && payload.revision && payload.source) {
        localStudioRevisionRef.current = payload.revision;
        setLocalStudio((current) => current
          ? {
              ...current,
              status: "conflict",
              external: {
                source: payload.source!,
                revision: payload.revision!,
                fileName: payload.fileName ?? current.fileName,
                filePath: payload.filePath ?? current.filePath,
              },
            }
          : current);
        setToast("Save blocked — the .dgm changed outside Studio");
        return false;
      }
      if (!response.ok || !payload.revision || !payload.fileName || !payload.filePath) {
        throw new Error(payload.message ?? "The local Studio could not save the diagram.");
      }
      localStudioRevisionRef.current = payload.revision;
      markTabSaved(tabId, candidate, payload.fileName);
      setLocalStudio((current) => current
        ? { ...current, ...payload as LocalStudioPayload, status: "connected", external: undefined }
        : current);
      void refreshProjectFiles();
      setToast(`Saved ${payload.fileName}`);
      return true;
    } catch (error) {
      setLocalStudio((current) => current ? { ...current, status: "disconnected" } : current);
      setToast(error instanceof Error ? error.message : "The local Studio could not save the diagram.");
      return false;
    }
  };

  const saveTabSource = async (tabId: string, requestedFilename?: string): Promise<boolean> => {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return false;
    if (!sourceIsValid(tab.source)) {
      setToast("Cannot save an invalid diagram. Fix the source errors first.");
      return false;
    }
    if (localStudio) {
      if (tabId === connectedStudioTabIdRef.current || requestedFilename) {
        const saved = await saveToLocalStudio(tabId, tab.source, requestedFilename);
        if (saved && requestedFilename) connectedStudioTabIdRef.current = tabId;
        return saved;
      }
    }
    const baseName = requestedFilename || tab.filename || tabLabel(tab);
    const filename = filenameWithExtension(baseName, "dgm");
    if (!downloadText(tab.source, filename)) {
      setToast("Save failed. Your browser blocked the download.");
      return false;
    }
    markTabSaved(tab.id, tab.source, filename);
    setToast(`Downloaded ${filename}`);
    return true;
  };

  const saveActive = () => { void saveTabSource(activeTab.id); };

  const exportCurrentSource = () => {
    const result = exportDgmFile(source, tabLabel(activeTab));
    setToast(result.ok ? `Downloaded ${result.filename}` : "Source export failed.");
  };

  const openSaveAs = () => {
    setSaveAsDraft(activeTab.filename || filenameWithExtension(tabLabel(activeTab), "dgm"));
    setSaveAsOpen(true);
  };

  const confirmSaveAs = async () => {
    const filename = normalizeSingleLineText(saveAsDraft);
    if (!filename) {
      setToast("Filename cannot be empty");
      return;
    }
    setSaveAsDraft(filename);
    if (await saveTabSource(activeTab.id, filename)) setSaveAsOpen(false);
  };

  const reloadExternalStudioSource = () => {
    const external = localStudio?.external;
    if (!external) return;
    localStudioRevisionRef.current = external.revision;
    const connectedTabId = connectedStudioTabIdRef.current;
    if (!connectedTabId) return;
    resetTab(connectedTabId, external.source, external.source, {
      filename: external.fileName,
      origin: "file",
    });
    setLocalStudio((current) => current
      ? { ...current, ...external, status: "connected", external: undefined }
      : current);
    setToast(`Reloaded ${external.fileName}`);
  };

  const keepLocalStudioChanges = () => {
    const external = localStudio?.external;
    if (!external) return;
    // The user explicitly chose to keep the in-browser copy. The next save
    // may now replace the newer disk revision instead of silently doing so.
    localStudioRevisionRef.current = external.revision;
    setLocalStudio((current) => current
      ? { ...current, revision: external.revision, status: "connected", external: undefined }
      : current);
    setToast("Kept your changes — save to overwrite the file");
  };

  const resetTransientState = () => {
    setSelection([]);
    setPendingPort(null);
    setContextMenu(null);
    setTabContextMenu(null);
    setTool("select");
  };

  const resetExample = () => {
    if (activeTab.origin !== "example") {
      setResetExampleOpen(false);
      return;
    }
    if (sourceCommitTimerRef.current !== null) {
      window.clearTimeout(sourceCommitTimerRef.current);
      sourceCommitTimerRef.current = null;
    }
    resetActive(activeTab.initialSource, activeTab.initialSource, {
      initialSource: activeTab.initialSource,
      origin: "example",
      filename: activeTab.filename,
    });
    clearDraft();
    resetTransientState();
    setDefaultFrameKey((current) => current + 1);
    setResetExampleOpen(false);
    setToast("Example reset");
  };

  const tabLimitMessage = `You can have up to ${MAX_WORKSPACE_TABS} open diagrams. Close a tab to create another.`;

  const renderTabPreview = useCallback((tab: WorkspaceTab): string | undefined => {
    try {
      const doc = parseDgm(tab.source);
      const issues = validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false });
      if (hasErrors(issues)) return undefined;
      const placedLayout = snapLayoutToGrid(layoutDocument(doc), snapToGrid, doc);
      const layout = attachRoutes(placedLayout, routeEdges(doc, placedLayout));
      return normalizeWorkspacePreview(renderSvg(doc, layout, {
        resolveIconHref: (path) => catalogIconUrl(path),
      }));
    } catch {
      return undefined;
    }
  }, [snapToGrid]);

  const previewsForTabs = useCallback((targetTabs: WorkspaceTab[]): WorkspacePreviewMap => {
    const previews: Record<string, string | undefined> = {};
    for (const tab of targetTabs) previews[tab.id] = renderTabPreview(tab);
    return previews;
  }, [renderTabPreview]);

  const consumeClosingPreviews = () => {
    const previews = pendingClosePreviewsRef.current;
    pendingClosePreviewsRef.current = {};
    return previews;
  };

  const beginTabClose = (tabId: string, previewByTabId: WorkspacePreviewMap = {}) => {
    if (closingTabId || tabs.length <= 1 || !tabs.some((tab) => tab.id === tabId)) return;
    pendingClosePreviewsRef.current = previewByTabId;
    if (tabId === activeTabId) {
      const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
      const nextActiveTab = tabs[closingIndex - 1] ?? tabs[closingIndex + 1];
      if (nextActiveTab) setActiveTab(nextActiveTab.id);
    }
    setClosingTabId(tabId);
    resetTransientState();
    // Animation events are the precise path. This only protects against a
    // backgrounded page or a browser that suppresses animations entirely.
    closeAnimationTimerRef.current = window.setTimeout(() => {
      closeAnimationTimerRef.current = null;
      closeTab(tabId, consumeClosingPreviews());
      setClosingTabId(null);
    }, TAB_CLOSE_FALLBACK_MS);
  };

  const finishTabClose = (tabId: string) => {
    if (tabId !== closingTabId) return;
    if (closeAnimationTimerRef.current !== null) {
      window.clearTimeout(closeAnimationTimerRef.current);
      closeAnimationTimerRef.current = null;
    }
    window.requestAnimationFrame(() => {
      closeTab(tabId, consumeClosingPreviews());
      setClosingTabId(null);
    });
  };

  const handleNewTab = () => {
    if (!newTab()) {
      setToast(tabLimitMessage);
      return;
    }
    resetTransientState();
    setToast("New diagram created");
  };

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    resetTransientState();
  };

  const handleCloseTab = (tabId: string) => {
    if (closingTabId || tabs.length <= 1) return;
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    if (isTabDirty(tab)) {
      setCloseRequest(tabId);
      return;
    }
    beginTabClose(tabId, previewsForTabs([tab]));
  };

  const closeRequestedTab = () => {
    if (!closeRequest) return;
    const tabId = closeRequest;
    const tab = tabs.find((candidate) => candidate.id === tabId);
    setCloseRequest(null);
    beginTabClose(tabId, tab ? previewsForTabs([tab]) : {});
  };

  const saveAndCloseRequestedTab = async () => {
    if (!closeRequest) return;
    const tabId = closeRequest;
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (await saveTabSource(tabId)) {
      setCloseRequest(null);
      beginTabClose(tabId, tab ? previewsForTabs([tab]) : {});
    }
  };

  const handleOpenFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    // FileList is live and is cleared by the input after this handler returns.
    // Snapshot it before yielding so the browser can paint the progress state.
    const inputFiles = Array.from(files);
    setOperation({ label: `Opening ${inputFiles.length} diagram${inputFiles.length === 1 ? "" : "s"}…` });
    await waitForPaint();
    const opened: string[] = [];
    const rejected: string[] = [];
    const remainingSlots = Math.max(0, MAX_WORKSPACE_TABS - tabs.length);
    let limitReached = inputFiles.length > remainingSlots;
    try {
      for (const file of inputFiles.slice(0, remainingSlots)) {
        try {
          if (file.size > DIAGRAM_LIMITS.sourceBytes) {
            rejected.push(`${file.name} (over 1 MiB)`);
            continue;
          }
          if (!/\.dgm$/i.test(file.name)) {
            rejected.push(file.name);
            continue;
          }
          const candidate = await file.text();
          const doc = parseDgm(candidate);
          if (hasErrors(validateDocument(doc, getCatalogMap()))) {
            rejected.push(file.name);
            continue;
          }
          for (const asset of doc.assets ?? []) sanitizeSvg(asset.content);
          const filename = normalizeSingleLineText(file.name).slice(0, DIAGRAM_LIMITS.filenameCharacters);
          if (!openTab(candidate, { filename, origin: "import" })) {
            limitReached = true;
            continue;
          }
          opened.push(file.name);
        } catch {
          rejected.push(file.name);
        }
        await waitForPaint();
      }
      if (opened.length) {
        resetTransientState();
        setToast(`Opened ${opened.length} diagram${opened.length === 1 ? "" : "s"}`);
      }
      if (rejected.length) {
        setToast(`Rejected ${rejected.slice(0, 3).join(", ")}${rejected.length > 3 ? ` and ${rejected.length - 3} more` : ""}: invalid .dgm source`);
      }
      if (limitReached) setToast(tabLimitMessage);
    } finally {
      setOperation(null);
    }
  };

  const duplicateTabWithFeedback = (tabId: string) => {
    if (!duplicateTab(tabId)) {
      setToast(tabLimitMessage);
      return;
    }
    resetTransientState();
    setToast("Duplicated diagram in a new tab");
  };

  const duplicateActiveTab = () => duplicateTabWithFeedback(activeTab.id);

  const handleTabContextMenu = (tabId: string, x: number, y: number) => {
    setContextMenu(null);
    setTabContextMenu({ tabId, x, y });
  };

  const requestBulkClose = (kind: "all" | "right", tabId: string) => {
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) return;
    const targets = kind === "all" ? tabs : tabs.slice(index + 1);
    if (!targets.length) return;
    setTabContextMenu(null);
    setBulkCloseRequest({
      kind,
      tabId,
      tabCount: targets.length,
      dirtyCount: targets.filter((tab) => isTabDirty(tab)).length,
    });
  };

  const confirmBulkClose = async () => {
    if (!bulkCloseRequest) return;
    const tabIndex = tabs.findIndex((tab) => tab.id === bulkCloseRequest.tabId);
    const targets = bulkCloseRequest.kind === "all"
      ? tabs
      : tabIndex < 0 ? [] : tabs.slice(tabIndex + 1);
    setOperation({ label: `Preparing ${targets.length} preview${targets.length === 1 ? "" : "s"}…` });
    setBulkCloseRequest(null);
    await waitForPaint();
    try {
      const previews: Record<string, string | undefined> = {};
      for (const tab of targets) {
        previews[tab.id] = renderTabPreview(tab);
        await waitForPaint();
      }
      const closedCount = bulkCloseRequest.kind === "all"
        ? closeAllTabs(previews)
        : closeTabsToRight(bulkCloseRequest.tabId, previews);
      resetTransientState();
      if (closedCount) {
        setToast(`${closedCount} diagram${closedCount === 1 ? "" : "s"} moved to the recycle bin`);
      }
    } finally {
      setOperation(null);
    }
  };

  const restoreFromRecycleBin = (tabId: string) => {
    const tab = recentlyClosed.find((candidate) => candidate.id === tabId);
    if (!restoreClosed(tabId)) {
      setToast(tabs.length >= MAX_WORKSPACE_TABS ? tabLimitMessage : "That diagram is no longer available");
      return;
    }
    setRecycleBinOpen(false);
    resetTransientState();
    setToast(`Restored ${tab ? tabLabel(tab) : "diagram"} from the recycle bin`);
  };

  const removeFromRecycleBin = (tabId: string) => {
    if (removeClosed(tabId)) setToast("Removed diagram from the recycle bin");
  };

  const emptyRecycleBin = () => {
    if (clearRecentlyClosed()) setToast("Recycle bin emptied");
  };

  const reopenLastTab = () => {
    if (reopenClosed()) {
      resetTransientState();
      setToast("Reopened diagram");
    } else if (tabs.length >= MAX_WORKSPACE_TABS) {
      setToast(tabLimitMessage);
    }
  };

  const openExampleInTab = (example: DiagramExample) => {
    if (tabs.length >= MAX_WORKSPACE_TABS) {
      setToast(tabLimitMessage);
      return;
    }
    setOpeningExampleId(example.id);
    startExampleOpening(() => {
      if (!openTab(example.source, {
        initialSource: example.source,
        filename: `${example.id}.dgm`,
        origin: "example",
      })) {
        setToast(tabLimitMessage);
        return;
      }
      setExamplesOpen(false);
      setHelpOpen(false);
      resetTransientState();
      setToast(`Opened ${example.title}`);
    });
  };

  useEffect(() => {
    if (!isExampleOpening && openingExampleId !== null) setOpeningExampleId(null);
  }, [isExampleOpening, openingExampleId]);

  const compiled = useDiagramCompilation(source, snapToGrid);

  useEffect(() => {
    if (compiled.ok) lastGoodRef.current = compiled;
  }, [compiled]);

  useEffect(() => {
    if (sourceCommitTimerRef.current) {
      window.clearTimeout(sourceCommitTimerRef.current);
      sourceCommitTimerRef.current = null;
    }
    lastGoodRef.current = null;
    resetTransientState();
  }, [activeTabId]);

  useEffect(() => {
    if (!workspaceReady || activeTab.viewportCustomized) return;
    setDefaultFrameKey((current) => current + 1);
  }, [activeTab.viewportCustomized, activeTabId, workspaceReady]);

  useEffect(() => {
    if (!workspaceReady || !RECOVERY) return;
    if (activeTab.origin === "recovery") setToast("Draft restored");
    clearDraft();
  }, [activeTab.origin, workspaceReady]);

  const displayCompiled = compiled.ok ? compiled : lastGoodRef.current;
  const displayCanvas = displayCompiled
    ? displayCompiled.layout.canvasBounds ?? {
        x: 0,
        y: 0,
        w: displayCompiled.layout.width,
        h: displayCompiled.layout.height,
      }
    : null;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast, toastNonce]);

  useEffect(() => {
    if (compiled.ok) setTitleDraft(documentNameForDisplay(compiled.doc));
  }, [compiled.ok, compiled.ok ? compiled.doc.title : "", compiled.ok ? compiled.doc.id : ""]);

  const selectItem = (item: SelectionItem, additive: boolean) => {
    setSelection((current) => toggleSelectionItem(current, item, additive));
    if (tool === "layers") setTool("select");
  };

  const requestTextEdit = (item: SelectionItem) => {
    setSelection([item]);
    if (tool === "layers") setTool("select");
    setTextEditRequest(item);
  };

  useEffect(() => {
    if (!textEditRequest) return;
    const fieldId = textEditRequest.kind === "edge"
      ? "edge-panel-label"
      : textEditRequest.kind === "annotation"
        ? "inspector-label"
        : null;
    if (!fieldId) return;

    const frame = window.requestAnimationFrame(() => {
      const field = document.getElementById(fieldId);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.focus();
        field.select();
      }
      setTextEditRequest(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [textEditRequest]);

  const issues = useMemo(() => {
    if ("parseError" in compiled && compiled.parseError) {
      return [{ message: compiled.parseError }];
    }
    if (!compiled.ok) {
      return compiled.issues.map((i) => ({ message: i.message }));
    }
    return compiled.invariantFailures;
  }, [compiled]);

  const commitDocument = (doc: DiagramDocument): boolean => {
    const nextIssues = validateDocument(doc, getCatalogMap(), { enforceCatalogRules: false });
    const error = nextIssues.find((issue) => issue.level === "error");
    if (error) {
      setToast(error.message);
      return false;
    }
    const nextSource = printDgm(doc);
    sourceRef.current = nextSource;
    commitSource(nextSource);
    return true;
  };

  const updateDocument = (doc: DiagramDocument) => commitDocument(doc);

  const previewMutate = (
    change: (doc: DiagramDocument) => DiagramDocument,
  ) => {
    try {
      const next = change(parseDgm(sourceRef.current));
      if (hasErrors(validateDocument(next, getCatalogMap(), { enforceCatalogRules: false }))) return;
      const nextSource = printDgm(next);
      replaceSource(nextSource);
    } catch {
      // Keep the source editor authoritative while it contains parse errors.
    }
  };

  const mutateCurrent = (change: (doc: DiagramDocument) => DiagramDocument) => {
    try {
      const next = change(parseDgm(sourceRef.current));
      startTransition(() => {
        commitDocument(next);
      });
    } catch {
      // Keep the source editor authoritative while it contains parse errors.
    }
  };

  const renameCurrent = () => {
    try {
      const title = normalizeSingleLineText(titleDraft);
      const nextDoc = setTitle(parseDgm(sourceRef.current), title);
      if (!commitDocument(nextDoc)) return;
      setTitleDraft(title);
      setTabFilename(activeTab.id, filenameWithExtension(documentNameForDisplay(nextDoc), "dgm"));
    } catch {
      // Keep the source editor authoritative while it contains parse errors.
    }
  };

  const onSourceChange = (next: string) => {
    if (utf8ByteLength(next) > DIAGRAM_LIMITS.sourceBytes) {
      setToast("Diagram exceeds the 1 MiB source limit");
      return;
    }
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

  const autoFix = () => {
    try {
      const current = parseDgm(sourceRef.current);
      setPendingPort(null);
      if (!needsAutoFix(current)) {
        setToast("Already auto-fixed");
        return;
      }
      commitDocument(clearView(current));
      setToast("Diagram auto-fixed");
    } catch {
      // Keep the source editor authoritative while it contains parse errors.
    }
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

  const addCatalogResource = (entry: CatalogEntry, requestedPlacement?: CatalogPlacement) => {
    if (!compiled.ok) return;
    const parent = requestedPlacement
      ? requestedPlacement.parent
      : primarySelection(selection)?.kind === "group"
        ? primarySelection(selection)!.id
        : undefined;
    const placement = canPlaceCatalogEntry(compiled.doc, entry, parent);
    if (!placement.ok) {
      setToast(placement.reason ?? "The selected parent group is no longer available.");
      return;
    }
    const at = requestedPlacement?.at ?? snapPoint(
      parent
        ? insertionPoint(compiled.layout, parent)
        : leftStagingInsertionPoint(compiled.layout, 240),
      snapToGrid,
    );
    try {
      const result = addResource(compiled.doc, entry, parent, at);
      const placedDoc = requestedPlacement?.manual
        ? setPlace(result.doc, result.id, at.x, at.y)
        : result.doc;
      if (!updateDocument(placedDoc)) return;
      setSelection([{ kind: "resource", id: result.id }]);
      setTool("select");
    } catch (error) {
      setToast((error as Error).message);
    }
  };

  const addCatalogGroup = (
    entry: CatalogEntry,
    kind: GroupKind,
    requestedPlacement?: CatalogPlacement,
  ) => {
    if (!compiled.ok) return;
    const parent = requestedPlacement
      ? requestedPlacement.parent
      : primarySelection(selection)?.kind === "group"
        ? primarySelection(selection)!.id
        : undefined;
    const at = requestedPlacement?.at ?? snapPoint(
      parent
        ? insertionPoint(compiled.layout, parent)
        : leftStagingInsertionPoint(compiled.layout, 360),
      snapToGrid,
    );
    try {
      const result = addGroup(
        compiled.doc,
        kind,
        entry.name,
        parent,
        at,
        entry.type,
      );
      const placedDoc = requestedPlacement?.manual
        ? setPlace(result.doc, result.id, at.x, at.y)
        : result.doc;
      if (!updateDocument(placedDoc)) return;
      setSelection([{ kind: "group", id: result.id }]);
      setTool("select");
    } catch (error) {
      setToast((error as Error).message);
    }
  };

  const addBoundary = () => {
    if (!compiled.ok) return;
    const parent = primarySelection(selection)?.kind === "group"
      ? primarySelection(selection)!.id
      : undefined;
    const at = snapPoint(
      parent
        ? insertionPoint(compiled.layout, parent)
        : leftStagingInsertionPoint(compiled.layout, 360),
      snapToGrid,
    );
    try {
      const result = addGroup(
        compiled.doc,
        "logical",
        "Boundary",
        parent,
        at,
        "cloud-agnostic.boundary",
      );
      if (!updateDocument(result.doc)) return;
      setSelection([{ kind: "group", id: result.id }]);
      setTool("select");
    } catch (error) {
      setToast((error as Error).message);
    }
  };

  const catalogGroupAt = (point: Point): string | undefined => {
    if (!compiled.ok) return undefined;
    return [...compiled.layout.groups]
      .filter((group) => containsPoint(group.content, point))
      .sort((a, b) => a.content.w * a.content.h - b.content.w * b.content.h)
      .at(0)?.id;
  };

  const handleCatalogDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes(CATALOG_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleCatalogDrop = (
    event: ReactDragEvent<HTMLDivElement>,
    point: Point,
  ) => {
    const payload = parseCatalogDragPayload(
      event.dataTransfer.getData(CATALOG_DRAG_MIME),
    );
    if (!payload) return;
    event.preventDefault();
    const entry = getCatalogEntry(payload.type);
    if (!entry || (payload.assetKind && payload.assetKind !== entry.assetKind)) {
      setToast("That catalog item is no longer available.");
      return;
    }
    const placement: CatalogPlacement = {
      parent: catalogGroupAt(point),
      at: snapPoint(point, snapToGrid),
      manual: true,
    };
    if (entry.assetKind === "group") {
      addCatalogGroup(entry, (entry.groupKind as GroupKind) ?? "logical", placement);
    } else {
      addCatalogResource(entry, placement);
    }
  };

  const openNoteComposer = () => {
    setNoteComposerStyle("paper");
    setPendingPort(null);
    setTool("note");
  };

  const createNote = (style: AnnotationStyle) => {
    if (!compiled.ok) return;
    const size = annotationSize(style);
    const at = snapPoint(leftStagingInsertionPoint(compiled.layout, size.w), snapToGrid);
    const result = addAnnotation(compiled.doc, "Note", at, undefined, style);
    if (!updateDocument(result.doc)) return;
    setSelection([{ kind: "annotation", id: result.id }]);
    setTool("select");
  };

  const openTextComposer = () => {
    setTextDraft("Text");
    setTextFont("sans");
    setTextFontSize(14);
    setTextAlign("left");
    setPendingPort(null);
    setTool("text");
  };

  const createText = () => {
    if (!compiled.ok) return;
    const text = normalizeMultilineText(textDraft);
    if (!text) {
      setToast("Enter some text before placing it");
      return;
    }
    const at = snapPoint(leftStagingInsertionPoint(compiled.layout, 240), snapToGrid);
    const result = addText(compiled.doc, text, at, {
      font: textFont,
      fontSize: textFontSize,
      align: textAlign,
    });
    if (!updateDocument(result.doc)) return;
    setSelection([{ kind: "annotation", id: result.id }]);
    setTool("select");
  };

  const connectPorts = (
    sourceNodeId: string,
    sourceSide: Side,
    sourceOffset: number,
    targetNodeId: string,
    targetSide: Side,
    targetOffset: number,
  ) => {
    if (!compiled.ok || sourceNodeId === targetNodeId) return;
    const result = addEdge(
      compiled.doc,
      sourceNodeId,
      targetNodeId,
      sourceSide,
      targetSide,
      sourceOffset,
      targetOffset,
    );
    if (!updateDocument(result.doc)) return;
    setPendingPort(null);
    setSelection([{ kind: "edge", id: result.id }]);
    setTool("select");
  };

  const choosePort = (nodeId: string, side: Side, offset: number) => {
    if (!compiled.ok) return;
    if (!pendingPort || pendingPort.nodeId === nodeId) {
      setPendingPort({ nodeId, side, offset });
      setSelection([{ kind: "resource", id: nodeId }]);
      return;
    }
    connectPorts(
      pendingPort.nodeId,
      pendingPort.side,
      pendingPort.offset,
      nodeId,
      side,
      offset,
    );
  };

  const copySelection = async (
    items: Selection = selection,
    showToast = true,
  ): Promise<boolean> => {
    if (!compiled.ok || items.length === 0) return false;
    let payload: string;
    try {
      payload = serializeClipboard(compiled.doc, items);
    } catch (error) {
      setToast((error as Error).message);
      return false;
    }
    internalClipboardRef.current = payload;
    try {
      await navigator.clipboard?.writeText(payload);
    } catch {
      // The internal clipboard keeps copy/cut/duplicate reliable when the
      // browser denies clipboard access (for example outside a secure origin).
    }
    if (showToast) setToast("Copied selection");
    return true;
  };

  const cutSelection = async (items: Selection = selection) => {
    if (!compiled.ok || items.length === 0) return;
    if (!(await copySelection(items, false))) return;
    mutateCurrent((doc) => deleteSelection(doc, items));
    setSelection((current) =>
      current.filter(
        (candidate) =>
          !items.some(
            (item) => item.kind === candidate.kind && item.id === candidate.id,
          ),
      ),
    );
    setContextMenu(null);
    setToast("Cut selection");
  };

  const pasteSelection = async (requestedPoint?: Point) => {
    if (!compiled.ok) return;
    const at = snapPoint(requestedPoint ?? insertionPoint(compiled.layout), snapToGrid);
    try {
      const clipboardItems = await navigator.clipboard?.read?.();
      const imageItem = clipboardItems?.find((item) =>
        item.types.some((type) => /^image\/(?:png|jpeg|webp|gif)$/.test(type)),
      );
      const imageType = imageItem?.types.find((type) =>
        /^image\/(?:png|jpeg|webp|gif)$/.test(type),
      );
      if (imageItem && imageType) {
        const blob = await imageItem.getType(imageType);
        const [{ width, height }, dataUrl] = await Promise.all([
          rasterDimensions(blob),
          blobAsDataUrl(blob),
        ]);
        const rawSvg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="${dataUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/></svg>`;
        const imported = importSvgAsset(compiled.doc, rawSvg);
        const placed = addCustomResource(
          imported.doc,
          imported.assetId,
          "Pasted image",
          undefined,
          at,
        );
        if (!updateDocument(placed.doc)) return;
        setSelection([{ kind: "resource", id: placed.id }]);
        setContextMenu(null);
        setToast("Pasted image");
        return;
      }
    } catch (error) {
      const message = (error as Error).message;
      if (message && !/permission|denied|not allowed/i.test(message)) {
        setToast(message);
        return;
      }
      // Clipboard image reads may be unavailable; continue with diagram text.
    }
    let systemPayload: string | null = null;
    try {
      systemPayload = (await navigator.clipboard?.readText()) ?? null;
    } catch {
      // Fall back to the app clipboard below.
    }
    const payloads = [systemPayload, internalClipboardRef.current].filter(
      (payload, index, all): payload is string => Boolean(payload) && all.indexOf(payload) === index,
    );
    for (const payload of payloads) {
      try {
        const result = pasteClipboard(compiled.doc, payload, at);
        if (!updateDocument(result.doc)) return;
        setSelection(result.selection);
        setToast("Pasted selection");
        return;
      } catch {
        // A non-diagram system clipboard entry should not block the app copy.
      }
    }
    setToast("Paste failed");
  };

  const duplicateCurrentSelection = (items: Selection = selection) => {
    if (!compiled.ok || items.length === 0) return;
    const result = duplicateSelection(compiled.doc, items);
    if (!updateDocument(result.doc)) return;
    setSelection(result.selection);
    setContextMenu(null);
    setToast("Duplicated selection");
  };

  const deleteCurrentSelection = (items: Selection = selection) => {
    if (!compiled.ok || items.length === 0) return;
    mutateCurrent((doc) => deleteSelection(doc, items));
    setSelection((current) =>
      current.filter(
        (candidate) =>
          !items.some(
            (item) => item.kind === candidate.kind && item.id === candidate.id,
          ),
      ),
    );
    setContextMenu(null);
    setToast("Deleted selection");
  };

  const toggleSelectedLocked = () => {
    if (!compiled.ok || selection.length !== 1) return;
    const item = selection[0]!;
    const view = compiled.doc.views[0];
    const place = item.kind === "annotation"
      ? view?.annotations?.[item.id]
      : view?.places[item.id];
    mutateCurrent((doc) => setLocked(doc, item.kind, item.id, !place?.locked));
  };

  const toggleSelectedVisible = () => {
    if (!compiled.ok || selection.length !== 1) return;
    const item = selection[0]!;
    const view = compiled.doc.views[0];
    const place = item.kind === "annotation"
      ? view?.annotations?.[item.id]
      : view?.places[item.id];
    mutateCurrent((doc) => setVisible(doc, item.kind, item.id, place?.visible === false));
  };

  const changeSelectedZIndex = (direction: "front" | "back") => {
    if (!compiled.ok || selection.length !== 1) return;
    const item = selection[0]!;
    mutateCurrent((doc) => direction === "front"
      ? sendToFront(doc, item.id)
      : sendToBack(doc, item.id));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (mod && key === "n") {
        event.preventDefault();
        handleNewTab();
        return;
      }
      if (mod && key === "o") {
        event.preventDefault();
        fileInputRef.current?.click();
        return;
      }
      if (mod && key === "s") {
        event.preventDefault();
        if (event.shiftKey) openSaveAs();
        else saveActive();
        return;
      }
      if (mod && key === "w") {
        event.preventDefault();
        handleCloseTab(activeTab.id);
        return;
      }

      if (target.matches("textarea, input, select, [contenteditable='true']") || target.closest(".cm-editor")) return;

      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && key === "y") {
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
        deleteCurrentSelection();
        return;
      }
      if (mod && key === "a") {
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
        return;
      }
      if (mod && key === "c") {
        event.preventDefault();
        void copySelection();
        return;
      }
      if (mod && key === "x") {
        event.preventDefault();
        void cutSelection();
        return;
      }
      if (mod && key === "v") {
        event.preventDefault();
        void pasteSelection();
        return;
      }
      if (mod && key === "d") {
        event.preventDefault();
        duplicateCurrentSelection();
        return;
      }
      if (key === "v" && !mod) setTool("select");
      if (key === "c" && !mod) setTool("connector");
      if (key === "t" && !mod) openTextComposer();
      if (selection.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 32 : 8;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        mutateCurrent((doc) =>
          nudgeSelection(doc, selection, dx, dy, { snapToGrid }),
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection, source, undo, redo, compiled, snapToGrid]);

  const fileMenuItems: TopMenuItem[] = [
    { id: "new", label: "New diagram", shortcut: "⌘N / Ctrl+N", onSelect: handleNewTab },
    { id: "open", label: "Open / Import .dgm", shortcut: "⌘O / Ctrl+O", onSelect: () => fileInputRef.current?.click() },
    { id: "project-files", label: "Open project diagram…", disabled: !localStudio, onSelect: openProjectFiles },
    { id: "recycle-bin", label: `Recycle bin${recentlyClosed.length ? ` (${recentlyClosed.length})` : ""}`, onSelect: () => setRecycleBinOpen(true) },
    { id: "file-divider-1", label: "", separator: true },
    { id: "save", label: "Save", shortcut: "⌘S / Ctrl+S", disabled: !compiled.ok, onSelect: saveActive },
    { id: "save-as", label: "Save As…", shortcut: "⌘⇧S / Ctrl+Shift+S", disabled: !compiled.ok, onSelect: openSaveAs },
    {
      id: "export",
      label: "Export",
      submenu: [
        { id: "export-studio", label: "Export…", disabled: !compiled.ok, onSelect: () => setExportDialogFormat("svg") },
        { id: "export-png", label: "PNG image…", disabled: !compiled.ok, onSelect: () => setExportDialogFormat("png") },
        { id: "export-pdf", label: "PDF document…", disabled: !compiled.ok, onSelect: () => setExportDialogFormat("pdf") },
        { id: "export-source", label: "Source (.dgm)", onSelect: exportCurrentSource },
      ],
    },
  ];

  const helpMenuItems: TopMenuItem[] = [
    { id: "examples", label: "Browse examples", onSelect: () => setExamplesOpen(true) },
    { id: "shortcuts", label: "Keyboard shortcuts", onSelect: () => setHelpOpen(true) },
    { id: "help-guide", label: "Source and LLM workflow", onSelect: () => setHelpOpen(true) },
    { id: "help-divider", label: "", separator: true },
    { id: "about", label: "About DumbDiagrams", onSelect: () => setHelpOpen(true) },
  ];

  const commands: Command[] = [
    { id: "command-new", label: "New diagram", section: "File", shortcut: "⌘N", onSelect: handleNewTab },
    { id: "command-open", label: "Open / Import .dgm", section: "File", shortcut: "⌘O", onSelect: () => fileInputRef.current?.click() },
    { id: "command-project-files", label: "Open project diagram", section: "File", disabled: !localStudio, onSelect: openProjectFiles },
    { id: "command-save", label: "Save", section: "File", shortcut: "⌘S", disabled: !compiled.ok, onSelect: saveActive },
    { id: "command-save-as", label: "Save As", section: "File", shortcut: "⌘⇧S", disabled: !compiled.ok, onSelect: openSaveAs },
    { id: "command-duplicate-tab", label: "Duplicate tab", section: "Workspace", onSelect: duplicateActiveTab },
    { id: "command-close-tab", label: "Close tab", section: "Workspace", shortcut: "⌘W", disabled: tabs.length <= 1, onSelect: () => handleCloseTab(activeTab.id) },
    { id: "command-reopen-tab", label: "Reopen closed tab", section: "Workspace", disabled: recentlyClosed.length === 0, onSelect: reopenLastTab },
    { id: "command-recycle-bin", label: `Open recycle bin${recentlyClosed.length ? ` (${recentlyClosed.length})` : ""}`, section: "Workspace", onSelect: () => setRecycleBinOpen(true) },
    { id: "command-examples", label: "Browse examples", section: "Help", onSelect: () => setExamplesOpen(true) },
    { id: "command-help", label: "Open help", section: "Help", onSelect: () => setHelpOpen(true) },
    { id: "command-undo", label: "Undo", section: "Edit", shortcut: "⌘Z", disabled: !canUndo, onSelect: undo },
    { id: "command-redo", label: "Redo", section: "Edit", shortcut: "⌘⇧Z", disabled: !canRedo, onSelect: redo },
    { id: "command-copy", label: "Copy selection", section: "Edit", shortcut: "⌘C", disabled: selection.length === 0, onSelect: () => void copySelection() },
    { id: "command-cut", label: "Cut selection", section: "Edit", shortcut: "⌘X", disabled: selection.length === 0, onSelect: () => void cutSelection() },
    { id: "command-paste", label: "Paste selection", section: "Edit", shortcut: "⌘V", disabled: !compiled.ok, onSelect: () => void pasteSelection() },
    { id: "command-duplicate-selection", label: "Duplicate selection", section: "Edit", shortcut: "⌘D", disabled: selection.length === 0, onSelect: () => duplicateCurrentSelection() },
    { id: "command-delete-selection", label: "Delete selection", section: "Edit", shortcut: "Delete", disabled: selection.length === 0, onSelect: () => deleteCurrentSelection() },
    { id: "command-align-left", label: "Align left", section: "Arrange", disabled: selection.length < 2 || !compiled.ok, onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "left")) },
    { id: "command-align-center", label: "Align center", section: "Arrange", disabled: selection.length < 2 || !compiled.ok, onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "center")) },
    { id: "command-align-right", label: "Align right", section: "Arrange", disabled: selection.length < 2 || !compiled.ok, onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "right")) },
    { id: "command-align-top", label: "Align top", section: "Arrange", disabled: selection.length < 2 || !compiled.ok, onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "top")) },
    { id: "command-align-middle", label: "Align middle", section: "Arrange", disabled: selection.length < 2 || !compiled.ok, onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "middle")) },
    { id: "command-align-bottom", label: "Align bottom", section: "Arrange", disabled: selection.length < 2 || !compiled.ok, onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "bottom")) },
    { id: "command-distribute-horizontal", label: "Distribute horizontally", section: "Arrange", disabled: selection.length < 3 || !compiled.ok, onSelect: () => compiled.ok && mutateCurrent((doc) => distributeSelection(doc, selection, compiled.layout, "horizontal")) },
    { id: "command-distribute-vertical", label: "Distribute vertically", section: "Arrange", disabled: selection.length < 3 || !compiled.ok, onSelect: () => compiled.ok && mutateCurrent((doc) => distributeSelection(doc, selection, compiled.layout, "vertical")) },
    { id: "command-bring-front", label: "Bring to front", section: "Arrange", disabled: selection.length !== 1 || !compiled.ok, onSelect: () => changeSelectedZIndex("front") },
    { id: "command-send-back", label: "Send to back", section: "Arrange", disabled: selection.length !== 1 || !compiled.ok, onSelect: () => changeSelectedZIndex("back") },
    { id: "command-toggle-lock", label: "Toggle lock", section: "Arrange", disabled: selection.length !== 1 || !compiled.ok, onSelect: toggleSelectedLocked },
    { id: "command-toggle-visibility", label: "Toggle visibility", section: "Arrange", disabled: selection.length !== 1 || !compiled.ok, onSelect: toggleSelectedVisible },
    { id: "command-auto-fix", label: "Auto-fix diagram", section: "View", onSelect: autoFix },
    { id: "command-fit", label: "Fit to screen", section: "View", onSelect: () => fitRef.current?.() },
    { id: "command-zoom-in", label: "Zoom in", section: "View", onSelect: () => updateViewport({ ...viewport, zoom: clampZoom(viewport.zoom + 0.1) }) },
    { id: "command-zoom-out", label: "Zoom out", section: "View", onSelect: () => updateViewport({ ...viewport, zoom: clampZoom(viewport.zoom - 0.1) }) },
    { id: "command-reset-zoom", label: "Reset zoom", section: "View", onSelect: () => updateViewport({ ...viewport, zoom: 1 }) },
    { id: "command-grid", label: snapToGrid ? "Disable snap to grid" : "Enable snap to grid", section: "View", onSelect: () => setSnapToGrid((current) => !current) },
    { id: "command-source", label: "Open source editor", section: "Tools", onSelect: () => setTool("code") },
    { id: "command-layers", label: "Open layers", section: "Tools", onSelect: () => setTool("layers") },
    { id: "command-resources", label: "Browse resources", section: "Tools", onSelect: () => setTool("resources") },
    { id: "command-text", label: "Add text", section: "Tools", shortcut: "T", onSelect: openTextComposer },
  ];
  const requestedCloseTab = closeRequest
    ? tabs.find((tab) => tab.id === closeRequest)
    : undefined;
  const tabContextTarget = tabContextMenu
    ? tabs.find((tab) => tab.id === tabContextMenu.tabId)
    : undefined;
  const tabContextMenuItems: ContextMenuItem[] = tabContextTarget ? [
    {
      id: "duplicate-tab",
      label: "Duplicate tab",
      onSelect: () => duplicateTabWithFeedback(tabContextTarget.id),
    },
    ...(tabs.length > 1 ? [{
      id: "close-tab",
      label: "Close tab",
      shortcut: "⌘W / Ctrl+W",
      danger: true,
      onSelect: () => handleCloseTab(tabContextTarget.id),
    }] : []),
    { id: "tab-context-divider", label: "", separator: true },
    {
      id: "close-tabs-right",
      label: "Close all to the right",
      danger: true,
      disabled: tabs.findIndex((tab) => tab.id === tabContextTarget.id) >= tabs.length - 1,
      onSelect: () => requestBulkClose("right", tabContextTarget.id),
    },
    {
      id: "close-all-tabs",
      label: "Close all",
      danger: true,
      onSelect: () => requestBulkClose("all", tabContextTarget.id),
    },
  ] : [];

  return (
    <div className="app" aria-busy={!workspaceReady || Boolean(operation)}>
      <section id="diagram-canvas" className="canvas-pane">
        <CanvasStage
          viewport={viewport}
          onViewportChange={updateViewport}
          contentSize={displayCanvas ? {
            x: displayCanvas.x,
            y: displayCanvas.y,
            width: displayCanvas.w,
            height: displayCanvas.h,
          } : undefined}
          defaultFrameKey={defaultFrameKey}
          onFitRequest={(fit) => {
            fitRef.current = fit;
          }}
          onCatalogDragOver={handleCatalogDragOver}
          onCatalogDrop={handleCatalogDrop}
          onContextMenu={(clientX, clientY, point) => {
            const canvasPoint = Number.isFinite(point.x) && Number.isFinite(point.y)
              ? snapPoint(point, snapToGrid)
              : snapPoint(insertionPoint(compiled.ok ? compiled.layout : displayCompiled!.layout), snapToGrid);
            setContextMenu({
              x: clientX,
              y: clientY,
              selection,
              canvasPoint,
            });
          }}
          onBackgroundClick={() => {
            setSelection([]);
            if (tool !== "connector") setPendingPort(null);
          }}
        >
          {displayCompiled?.svg ? (
            <div
              className="canvas-artboard"
              style={{
                left: displayCanvas?.x ?? 0,
                top: displayCanvas?.y ?? 0,
                width: displayCanvas?.w ?? displayCompiled.layout.width,
                height: displayCanvas?.h ?? displayCompiled.layout.height,
              }}
            >
              <RenderedDiagram svg={displayCompiled.svg} />
              {compiled.ok && <InteractionOverlay
                key={activeTabId}
                doc={compiled.doc}
                layout={compiled.layout}
                tool={interactionTool}
                zoom={viewport.zoom}
                snapToGrid={snapToGrid}
                selection={selection}
                pendingPort={pendingPort}
                onSelect={selectItem}
                onEditText={requestTextEdit}
                onMarquee={selectMarquee}
                onBackgroundClick={() => {
                  setSelection([]);
                  if (tool !== "connector") setPendingPort(null);
                }}
                onChoosePort={choosePort}
                onConnectPorts={connectPorts}
                onReconnect={(edgeId, endpoint, nodeId, side, offset) => {
                  mutateCurrent((doc) =>
                    reconnectEdge(
                      doc,
                      edgeId,
                      endpoint === "source"
                        ? { source: nodeId, sourcePort: side, sourcePortOffset: offset }
                        : { target: nodeId, targetPort: side, targetPortOffset: offset },
                    ),
                  );
                }}
                onGestureBegin={beginTransaction}
                onGestureEnd={endTransaction}
                onMove={(kind, id, x, y, dx, dy) => {
                  previewMutate((doc) => {
                    const item = { kind, id } as SelectionItem;
                    const active = selection.some((candidate) => candidate.kind === kind && candidate.id === id)
                      ? selection
                      : [item];
                    return moveSelection(doc, active, dx, dy, compiled.layout);
                  });
                }}
                onResize={(kind, id, w, h, unlockAspect) => {
                  previewMutate((doc) =>
                    setSize(doc, id, w, h, { unlockAspect }),
                  );
                }}
                onRoute={(edgeId, points) =>
                  previewMutate((doc) => setRoute(doc, edgeId, points))
                }
                onBadgeMove={(edgeId, t, side) =>
                  previewMutate((doc) => setEdgeBadgePosition(doc, edgeId, t, side))
                }
                onLabelMove={(edgeId, t, side) =>
                  mutateCurrent((doc) => setEdgeLabelPosition(doc, edgeId, t, side))
                }
                onContextMenu={(clientX, clientY, item) => {
                  const itemIsSelected = Boolean(
                    item &&
                      selection.some(
                        (candidate) =>
                          candidate.kind === item.kind && candidate.id === item.id,
                      ),
                  );
                  const nextSelection = item
                    ? itemIsSelected
                      ? selection
                      : [item]
                    : selection;
                  if (item && !itemIsSelected) setSelection([item]);
                  setContextMenu({
                    x: clientX,
                    y: clientY,
                    selection: nextSelection,
                  });
                }}
              />}
            </div>
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
        {localStudio?.status === "conflict" && localStudio.external && (
          <div className="local-studio-conflict" role="alert">
            <div className="local-studio-conflict-copy">
              <strong>File changed outside Studio</strong>
              <span>{localStudio.external.fileName} has a newer revision on disk.</span>
            </div>
            <div className="local-studio-conflict-actions">
              <button type="button" className="text-button" onClick={reloadExternalStudioSource}>Reload from disk</button>
              <button type="button" className="primary-button" onClick={keepLocalStudioChanges}>Keep my changes</button>
            </div>
          </div>
        )}

        <header className="floating-topbar">
          <div className="topbar-left">
            <div className="document-name-field">
              <input
                ref={titleInputRef}
                className="title-input"
                value={titleDraft}
                maxLength={DIAGRAM_LIMITS.titleCharacters}
                placeholder="Untitled diagram"
                title="Rename diagram"
                onChange={(event) => setTitleDraft(event.target.value)}
                onPaste={(event) => rejectOversizedPaste(event, DIAGRAM_LIMITS.titleCharacters, () => setToast(`Diagram names are limited to ${DIAGRAM_LIMITS.titleCharacters} characters`))}
                onBlur={() => {
                  if (!compiled.ok) return;
                  renameCurrent();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              aria-label="Diagram name"
              aria-describedby="diagram-name-limit"
              />
              <span id="diagram-name-limit" className="sr-only" aria-live="polite">
                {characterLength(titleDraft)} of {DIAGRAM_LIMITS.titleCharacters} characters
              </span>
              <button
                type="button"
                className="document-name-edit"
                aria-label="Edit diagram name"
                title="Edit diagram name"
                onClick={() => {
                  titleInputRef.current?.focus();
                  titleInputRef.current?.select();
                }}
              >
                <IconEdit />
              </button>
            </div>
            <span className="file-name">{activeTab.filename ?? ".dgm"}</span>
            {localStudio && (
              <span
                className={`local-studio-status is-${localStudio.status}`}
                title={localStudio.filePath}
              >
                <span className="local-studio-status-dot" aria-hidden="true" />
                {localStudio.status === "saving"
                  ? "Saving"
                  : localStudio.status === "disconnected"
                    ? "Studio disconnected"
                    : localStudio.status === "conflict"
                      ? "Needs review"
                      : "Local file"}
              </span>
            )}
          </div>
          <div className="topbar-center">
            <button
              type="button"
              className="auto-fix-button"
              title="Reset positions and connector routes to the opinionated layout"
              onClick={autoFix}
            >
              <IconMagicWand />
              <span>Auto-fix</span>
            </button>
            <button
              type="button"
              className={`snap-toggle${snapToGrid ? " is-active" : ""}`}
              aria-pressed={snapToGrid}
              title={`Snap top-level objects to the ${GRID_SIZE}px grid without changing nested spacing`}
              onClick={() => setSnapToGrid((current) => !current)}
            >
              <IconGrid />
              <span>Snap to grid</span>
            </button>
          </div>
          <div className="topbar-right">
            <span className={`status-pill ${issues.length ? "has-errors" : ""}`}>
              {issues.length
                ? `${issues.length} issue${issues.length === 1 ? "" : "s"}`
                : "Valid"}
            </span>
            {isTabDirty(activeTab) && <span className="dirty-pill">Unsaved</span>}
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
            <div className="topbar-group">
              <input
                ref={fileInputRef}
                type="file"
                accept=".dgm,text/plain"
                multiple
                hidden
                onChange={(event) => {
                  const files = event.currentTarget.files;
                  void handleOpenFiles(files);
                  event.currentTarget.value = "";
                }}
              />
              {compiled.ok ? (
                <ExportMenu
                  selectionCount={selection.length}
                  onOpenExport={setExportDialogFormat}
                />
              ) : (
                <button type="button" className="primary-button" disabled>
                  Export
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="studio-tabbar">
          <nav className="studio-tabbar-leading" aria-label="File menu">
            <TopMenu label="File" Icon={IconMenu} iconOnly items={fileMenuItems} />
            <div className="studio-brand" role="img" aria-label="Dumb Diagrams">
              <img
                className="brand-logo"
                src="./logo_dumbdiagrams.png"
                alt=""
                width="128"
                height="77"
              />
              <span className="dd-wordmark" aria-hidden="true">dumb<span className="dd-wordmark__light">diagrams</span><span className="dd-wordmark__dot">.</span></span>
            </div>
          </nav>
          <WorkspaceTabs
            tabs={tabs}
            activeTabId={activeTabId}
            closingTabId={closingTabId}
            tabLimit={MAX_WORKSPACE_TABS}
            getLabel={tabLabel}
            onSelect={handleSelectTab}
            onClose={handleCloseTab}
            onCloseAnimationEnd={finishTabClose}
            onNew={handleNewTab}
            onReorder={reorderTabs}
            onContextMenu={handleTabContextMenu}
          />
          <nav className="studio-tabbar-actions" aria-label="Studio menu">
            <ThemeControl />
            <TopMenu label="Help" Icon={IconHelp} items={helpMenuItems} />
          </nav>
        </div>

        <ToolDock
          active={tool}
          onChange={(next) => {
            if (next === "note") {
              openNoteComposer();
              return;
            }
            if (next === "text") {
              openTextComposer();
              return;
            }
            setTool(next);
            if (next !== "connector") setPendingPort(null);
          }}
        />

        {tool === "note" && (
          <FloatingPanel
            className="note-composer-sheet"
            title="Choose note style"
            subtitle="Pick a format before placing it on the canvas"
            onClose={() => setTool("select")}
            width={340}
          >
            <NoteComposer
              style={noteComposerStyle}
              onStyleChange={setNoteComposerStyle}
              onCreate={() => createNote(noteComposerStyle)}
            />
          </FloatingPanel>
        )}

        {tool === "text" && (
          <FloatingPanel
            className="drawer-sheet text-composer-sheet"
            title="Add text"
            subtitle="Place editable text on the canvas"
            onClose={() => setTool("select")}
            width={LEFT_DRAWER_WIDTH}
          >
            <TextComposer
              value={textDraft}
              onChange={setTextDraft}
              font={textFont}
              fontSize={textFontSize}
              align={textAlign}
              onFontChange={setTextFont}
              onFontSizeChange={setTextFontSize}
              onAlignChange={setTextAlign}
              onCreate={createText}
            />
          </FloatingPanel>
        )}

        {tool === "resources" && (
          <FloatingPanel
            className="drawer-sheet asset-sheet"
            title="Resources"
            subtitle="Browse services by provider and category"
            onClose={() => setTool("select")}
            width={LEFT_DRAWER_WIDTH}
          >
            <AssetBrowser
              mode="resources"
              onAddService={addCatalogResource}
              onAddGroup={() => {}}
              onImportSvg={async (file) => {
                if (!compiled.ok) return;
                try {
                  if (file.size > DIAGRAM_LIMITS.svgBytes) throw new Error("SVG exceeds 256 KiB limit");
                  const text = await file.text();
                  const imported = importSvgAsset(compiled.doc, text);
                  const importParent = primarySelection(selection)?.kind === "group"
                    ? primarySelection(selection)!.id
                    : undefined;
                  const placed = addCustomResource(
                    imported.doc,
                    imported.assetId,
                    normalizeSingleLineText(file.name.replace(/\.svg$/i, "")),
                    importParent,
                    snapPoint(
                      importParent
                        ? insertionPoint(compiled.layout, importParent)
                        : leftStagingInsertionPoint(compiled.layout, 240),
                      snapToGrid,
                    ),
                  );
                  if (!updateDocument(placed.doc)) return;
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
            title="Boundaries"
            subtitle="Logical and infrastructure scopes by provider"
            onClose={() => setTool("select")}
            width={LEFT_DRAWER_WIDTH}
          >
            <AssetBrowser
              mode="groups"
              onAddService={() => {}}
              onAddGroup={addCatalogGroup}
              onAddBoundary={addBoundary}
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
            width={LEFT_DRAWER_WIDTH}
          >
            <ConnectorDrawer pendingPort={pendingPort} />
          </FloatingPanel>
        )}

        {compiled.ok &&
          selection.some((item) => item.kind === "edge") && (
            <FloatingPanel
            className="drawer-sheet edge-sheet"
            title="Connector"
            subtitle="Meaning, appearance, and routing"
              onClose={() =>
                setSelection((current) => current.filter((item) => item.kind !== "edge"))
              }
            width={360}
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
                    onUpdateLabel={(label) =>
                      mutateCurrent((doc) => renameEdge(doc, edge.id, normalizeSingleLineText(label)))
                    }
                    onUpdateEdge={(patch) =>
                      mutateCurrent((doc) =>
                        updateEdgePreservingLayout(doc, edge.id, patch, compiled.layout)
                      )
                    }
                    onUpdateColor={(color) =>
                      mutateCurrent((doc) => updateEdge(doc, edge.id, { color }))
                    }
                    onUpdateStep={(step) =>
                      mutateCurrent((doc) => updateEdge(doc, edge.id, { step }))
                    }
                    onPinRoute={() => {
                      const edgeGeom = compiled.layout.edges.find(
                        (candidate) => candidate.id === edge.id,
                      );
                      if (!edgeGeom) return;
                      const routePoints = edgeGeom.points.map((point) =>
                        snapPoint(point, snapToGrid),
                      );
                      mutateCurrent((doc) =>
                        setRoute(doc, edge.id, normalizeOrthogonalRoute(routePoints)),
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
            width={LEFT_DRAWER_WIDTH}
          >
            <Suspense fallback={<div className="source-drawer"><div className="source-editor-shell source-drawer-loading">Loading source editor…</div></div>}>
              <SourceDrawer
                source={source}
                issues={issues}
                onChange={onSourceChange}
                onCommit={onSourceCommit}
                onFormat={() => {
                  try {
                    commitSource(printDgm(parseDgm(source)));
                    setToast("Formatted source");
                  } catch {
                    setToast("Cannot format invalid source");
                  }
                }}
                onReset={activeTab.origin === "example" ? () => setResetExampleOpen(true) : undefined}
              />
            </Suspense>
          </FloatingPanel>
        )}

        {tool === "layers" && compiled.ok && (
          <FloatingPanel
            className="drawer-sheet layers-sheet"
            title="Layers"
            subtitle="Hierarchy, visibility, and lock"
            onClose={() => setTool("select")}
            width={LEFT_DRAWER_WIDTH}
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
              const normalized = item.kind === "annotation"
                ? normalizeMultilineText(label)
                : normalizeSingleLineText(label);
              mutateCurrent((doc) => {
                if (item.kind === "resource") return renameResource(doc, item.id, normalized);
                if (item.kind === "group") return renameGroup(doc, item.id, normalized);
                if (item.kind === "edge") return renameEdge(doc, item.id, normalized);
                if (item.kind === "annotation") return updateAnnotationText(doc, item.id, normalized);
                return doc;
              });
            }}
            onLimitError={setToast}
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
            onSetResourceLabelPosition={(position) => {
              const resource = selection.find((item) => item.kind === "resource");
              if (!resource) return;
              mutateCurrent((doc) => setResourceLabelPosition(doc, resource.id, position));
            }}
            onSetGroupLabelPosition={(position) => {
              const group = selection.find((item) => item.kind === "group");
              if (!group) return;
              mutateCurrent((doc) => setGroupLabelPosition(doc, group.id, position));
            }}
            onSetGroupIconHidden={(hidden) => {
              const group = selection.find((item) => item.kind === "group");
              if (!group) return;
              mutateCurrent((doc) => setGroupIconHidden(doc, group.id, hidden));
            }}
            onSetBoundaryAppearance={(patch) => {
              const group = selection.find((item) => item.kind === "group");
              if (!group) return;
              mutateCurrent((doc) => setBoundaryAppearance(doc, group.id, patch));
            }}
            onSetAnnotationStyle={(style) => {
              const annotation = selection.find((item) => item.kind === "annotation");
              if (!annotation) return;
              mutateCurrent((doc) => setAnnotationStyle(doc, annotation.id, style));
            }}
            onSetTextFormat={(format) => {
              const annotation = selection.find((item) => item.kind === "annotation");
              if (!annotation) return;
              mutateCurrent((doc) => updateTextFormat(doc, annotation.id, format));
            }}
            onUpdateGroupStep={(step) => {
              const group = selection.find((item) => item.kind === "group");
              if (!group) return;
              mutateCurrent((doc) => updateGroupStep(doc, group.id, step));
            }}
            onUpdateEdge={(style, kind) => {
              const edge = selection.find((item) => item.kind === "edge");
              if (!edge) return;
              mutateCurrent((doc) =>
                updateEdgePreservingLayout(
                  doc,
                  edge.id,
                  { style, kind },
                  compiled.layout,
                )
              );
            }}
            onPinRoute={() => {
              const edgeItem = selection.find((item) => item.kind === "edge");
              const edge = edgeItem
                ? compiled.layout.edges.find((candidate) => candidate.id === edgeItem.id)
                : undefined;
              if (edge) {
                mutateCurrent((doc) =>
                  setRoute(doc, edge.id, normalizeOrthogonalRoute(edge.points)),
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
            <button type="button" onClick={openNoteComposer}>Add note</button>
          </div>
        )}

        <div className="status-capsule" role="toolbar" aria-label="Canvas view controls">
          <button
            type="button"
            className="status-capsule-button status-capsule-fit"
            onClick={() => fitRef.current?.()}
            title="Fit to screen"
            aria-label="Fit to screen"
          >
            <IconFit />
          </button>
          <button
            type="button"
            className="status-capsule-button status-capsule-reset"
            onClick={() => updateViewport({ ...viewport, zoom: 1 })}
            aria-label="Reset zoom"
          >
            100%
          </button>
          <div className="status-capsule-zoom" role="group" aria-label="Zoom controls">
            <button
              type="button"
              className="status-capsule-button status-capsule-step"
              onClick={() => updateViewport({ ...viewport, zoom: clampZoom(viewport.zoom - 0.1) })}
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              type="button"
              className="status-capsule-button status-capsule-step"
              onClick={() => updateViewport({ ...viewport, zoom: clampZoom(viewport.zoom + 0.1) })}
              aria-label="Zoom in"
            >
              +
            </button>
          </div>
          <span className="status-capsule-readout">{Math.round(viewport.zoom * 100)}%</span>
        </div>

        <footer
          className="privacy-footer"
          aria-label="Privacy notice"
          title="Your diagrams stay on this device. DumbDiagrams does not upload or store them on our servers."
        >
          <span className="privacy-footer-brand">© 2026 DumbDiagrams</span>
          <span className="privacy-footer-divider" aria-hidden="true">|</span>
          <span className="privacy-footer-message">
            <IconLock />
            <span>Your data stays on your device · nothing is uploaded.</span>
          </span>
        </footer>

        {toast && <div key={`${toast}-${toastNonce}`} className="toast" role="status">{toast}</div>}
        {operation && (
          <div className="operation-status" role="status" aria-live="polite">
            <span className="loading-spinner is-small" aria-hidden="true" />
            <span>{operation.label}</span>
          </div>
        )}
        {!workspaceReady && (
          <div className="workspace-loading" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <strong>Restoring your workspace…</strong>
            <span>Loading local diagrams and view settings</span>
          </div>
        )}

        {examplesOpen && (
          <Suspense fallback={(
            <Modal
              open
              title="Browse examples"
              subtitle="Loading the example gallery…"
              onClose={() => setExamplesOpen(false)}
              className="examples-modal"
              width={820}
            >
              <div className="examples-loading" role="status">
                <span className="loading-spinner" aria-hidden="true" />
                <span>Loading examples…</span>
              </div>
            </Modal>
          )}>
            <ExamplesModal
              open
              onClose={() => setExamplesOpen(false)}
              onOpen={openExampleInTab}
              openingExampleId={openingExampleId}
            />
          </Suspense>
        )}

        <ProjectFilesModal
          open={projectFilesOpen}
          files={projectFiles}
          activeFileName={localStudio?.fileName ?? ""}
          loading={projectFilesLoading}
          openingFileName={openingProjectFile}
          error={projectFilesError}
          onClose={() => setProjectFilesOpen(false)}
          onRefresh={() => void refreshProjectFiles()}
          onOpen={(fileName) => void selectProjectFile(fileName)}
        />

        <HelpModal
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          onExamples={() => {
            setHelpOpen(false);
            setExamplesOpen(true);
          }}
        />

        <CommandPalette
          open={commandPaletteOpen}
          commands={commands}
          onClose={() => setCommandPaletteOpen(false)}
        />

        {compiled.ok && (
          <ExportDialog
            open={exportDialogFormat !== null}
            initialFormat={exportDialogFormat ?? "svg"}
            title={documentNameForDisplay(compiled.doc)}
            source={source}
            doc={compiled.doc}
            layout={compiled.layout}
            selection={selection}
            getPortableSvg={() => renderPortableSvg(compiled.doc, compiled.layout)}
            onClose={() => setExportDialogFormat(null)}
            onToast={setToast}
          />
        )}

        <Modal
          open={saveAsOpen}
          title="Save diagram as"
          subtitle={localStudio
            ? "Create a new connected .dgm file next to the current project diagram."
            : "Choose the filename for the downloaded .dgm source."}
          onClose={() => setSaveAsOpen(false)}
          width={440}
        >
          <form
            className="save-as-form"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmSaveAs();
            }}
          >
            <label htmlFor="save-as-filename">Filename</label>
            <input
              id="save-as-filename"
              data-autofocus
              value={saveAsDraft}
              maxLength={DIAGRAM_LIMITS.filenameCharacters}
              onChange={(event) => setSaveAsDraft(event.target.value)}
              onPaste={(event) => rejectOversizedPaste(event, DIAGRAM_LIMITS.filenameCharacters, () => setToast(`Filenames are limited to ${DIAGRAM_LIMITS.filenameCharacters} characters`))}
              placeholder="diagram.dgm"
              aria-describedby="save-as-limit"
            />
            <span id="save-as-limit" className="input-limit" aria-live="polite">
              {characterLength(saveAsDraft)} / {DIAGRAM_LIMITS.filenameCharacters}
            </span>
            <div className="modal-actions">
              <button type="button" className="text-button" onClick={() => setSaveAsOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={!saveAsDraft.trim()}>Save .dgm</button>
            </div>
          </form>
        </Modal>

        <Modal
          open={Boolean(requestedCloseTab)}
          title="Unsaved changes"
          subtitle={requestedCloseTab ? tabLabel(requestedCloseTab) : undefined}
          onClose={() => setCloseRequest(null)}
          className="confirm-dialog"
          width={440}
        >
          <div className="confirm-modal">
            <p>Save your changes before closing this diagram?</p>
            <div className="modal-actions modal-actions-spread">
              <button type="button" className="text-button" onClick={() => setCloseRequest(null)}>Cancel</button>
              <button type="button" className="danger-button" onClick={closeRequestedTab}>Discard</button>
              <button type="button" className="primary-button" onClick={saveAndCloseRequestedTab}>Save and close</button>
            </div>
          </div>
        </Modal>

        <Modal
          open={Boolean(bulkCloseRequest)}
          title={bulkCloseRequest?.kind === "right" ? "Close tabs to the right?" : "Close all tabs?"}
          subtitle={bulkCloseRequest
            ? `${bulkCloseRequest.tabCount} tab${bulkCloseRequest.tabCount === 1 ? "" : "s"} will be closed`
            : undefined}
          onClose={() => setBulkCloseRequest(null)}
          className="confirm-dialog"
          width={460}
        >
          <div className="confirm-modal">
            {bulkCloseRequest?.dirtyCount ? (
              <p>
                {bulkCloseRequest.dirtyCount} unsaved diagram{bulkCloseRequest.dirtyCount === 1 ? "" : "s"} will be discarded. Closed diagrams remain in the recycle bin for recovery.
              </p>
            ) : (
              <p>These diagrams have no unsaved changes and will be closed.</p>
            )}
            <p>The recycle bin keeps the latest 10 closed diagrams.</p>
            <div className="modal-actions modal-actions-spread">
              <button type="button" className="text-button" onClick={() => setBulkCloseRequest(null)}>Cancel</button>
              <button type="button" className="danger-button" onClick={() => void confirmBulkClose()}>
                {bulkCloseRequest?.dirtyCount ? "Discard and close" : "Close tabs"}
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={resetExampleOpen}
          title="Reset example?"
          subtitle="Restore the original example diagram"
          onClose={() => setResetExampleOpen(false)}
          className="confirm-dialog"
          width={440}
        >
          <div className="confirm-modal">
            <p>Your current source will be replaced with the original example from the repository. Any unsaved edits will be discarded.</p>
            <div className="modal-actions modal-actions-spread">
              <button type="button" className="text-button" onClick={() => setResetExampleOpen(false)}>
                Cancel
              </button>
              <button type="button" className="danger-button" data-autofocus onClick={resetExample}>
                Reset example
              </button>
            </div>
          </div>
        </Modal>

        {recycleBinOpen && (
          <RecycleBinModal
            open
            tabs={recentlyClosed}
            getLabel={tabLabel}
            onClose={() => setRecycleBinOpen(false)}
            onRestore={restoreFromRecycleBin}
            onRemove={removeFromRecycleBin}
            onClear={emptyRecycleBin}
          />
        )}

        {tabContextMenu && tabContextTarget && (
          <ContextMenu
            x={tabContextMenu.x}
            y={tabContextMenu.y}
            ariaLabel="Tab context menu"
            onClose={() => setTabContextMenu(null)}
            items={tabContextMenuItems}
          />
        )}

        {contextMenu && compiled.ok && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            items={buildContextMenuItems(
              contextMenu.selection,
              compiled.doc,
              {
                onCopy: () => void copySelection(contextMenu.selection),
                onCut: () => void cutSelection(contextMenu.selection),
                onPaste: () => void pasteSelection(contextMenu.canvasPoint),
                onDuplicate: () => duplicateCurrentSelection(contextMenu.selection),
                onDelete: () => deleteCurrentSelection(contextMenu.selection),
                onMutate: (change) => mutateCurrent(change),
              },
            )}
          />
        )}

      </section>
    </div>
  );
}

function NoteComposer({
  style,
  onStyleChange,
  onCreate,
}: {
  style: AnnotationStyle;
  onStyleChange: (style: AnnotationStyle) => void;
  onCreate: () => void;
}) {
  const selected = ANNOTATION_STYLES.find((candidate) => candidate.id === style) ?? ANNOTATION_STYLES[0]!;

  return (
    <div className="note-composer">
      <div className="note-composer-intro">
        <NoteStylePreview style={style} className="note-composer-preview" />
        <div>
          <strong>{selected.label}</strong>
          <p>{selected.description}</p>
        </div>
      </div>

      <div className="property-section note-composer-section">
        <label>Choose a note type</label>
        <NoteStyleOptions
          selectedStyle={style}
          onStyleChange={onStyleChange}
          showPreviews
          includeText={false}
        />
      </div>

      <div className="note-composer-footer">
        <button type="button" className="primary-button note-create-button" onClick={onCreate}>
          Create {selected.label}
        </button>
      </div>
    </div>
  );
}

function TextComposer({
  value,
  font,
  fontSize,
  align,
  onChange,
  onFontChange,
  onFontSizeChange,
  onAlignChange,
  onCreate,
}: {
  value: string;
  font: TextFontFamily;
  fontSize: number;
  align: TextAlign;
  onChange: (value: string) => void;
  onFontChange: (font: TextFontFamily) => void;
  onFontSizeChange: (fontSize: number) => void;
  onAlignChange: (align: TextAlign) => void;
  onCreate: () => void;
}) {
  return (
    <div className="text-composer">
      <div className="property-section">
        <label htmlFor="text-composer-content">Text content</label>
        <textarea
          id="text-composer-content"
          data-autofocus
          value={value}
          maxLength={DIAGRAM_LIMITS.annotationCharacters}
          rows={5}
          placeholder="Type something…"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onCreate();
          }}
          aria-describedby="text-composer-hint"
        />
        <p id="text-composer-hint" className="property-hint">
          Press ⌘Enter or Ctrl+Enter to place. You can edit or drag it afterward.
        </p>
      </div>
      <TextFormattingControls
        idPrefix="composer"
        font={font}
        fontSize={fontSize}
        align={align}
        onChange={({ font: nextFont, fontSize: nextSize, align: nextAlign }) => {
          if (nextFont !== undefined) onFontChange(nextFont);
          if (nextSize !== undefined) onFontSizeChange(nextSize);
          if (nextAlign !== undefined) onAlignChange(nextAlign);
        }}
      />
      <div className="note-composer-footer">
        <button
          type="button"
          className="primary-button note-create-button"
          onClick={onCreate}
          disabled={!normalizeMultilineText(value)}
        >
          Place text
        </button>
      </div>
    </div>
  );
}

function TextFormattingControls({
  idPrefix,
  font,
  fontSize,
  align,
  onChange,
}: {
  idPrefix: string;
  font: TextFontFamily;
  fontSize: number;
  align: TextAlign;
  onChange: (format: { font?: TextFontFamily; fontSize?: number; align?: TextAlign }) => void;
}) {
  return (
    <div className="property-section text-formatting">
      <div className="property-control-row">
        <label htmlFor={`${idPrefix}-text-font-family`}>Font</label>
        <select
          id={`${idPrefix}-text-font-family`}
          value={font}
          onChange={(event) => onChange({ font: event.target.value as TextFontFamily })}
        >
          <option value="sans">Sans serif</option>
          <option value="serif">Serif</option>
          <option value="mono">Monospace</option>
        </select>
      </div>
      <div className="property-control-row">
        <label htmlFor={`${idPrefix}-text-font-size`}>Size</label>
        <select
          id={`${idPrefix}-text-font-size`}
          value={fontSize}
          onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
        >
          {[12, 14, 16, 20, 24, 32].map((size) => (
            <option key={size} value={size}>{size}px</option>
          ))}
        </select>
      </div>
      <div>
        <span className="property-control-label">Alignment</span>
        <div className="button-pair button-triplet" role="group" aria-label="Text alignment">
          {(["left", "center", "right"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={align === candidate ? "is-active" : ""}
              aria-pressed={align === candidate}
              onClick={() => onChange({ align: candidate })}
            >
              {candidate[0]!.toUpperCase() + candidate.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NoteStyleOptions({
  selectedStyle,
  onStyleChange,
  showPreviews = false,
  includeText = true,
}: {
  selectedStyle: AnnotationStyle;
  onStyleChange: (style: AnnotationStyle) => void;
  showPreviews?: boolean;
  includeText?: boolean;
}) {
  const styles = includeText
    ? ANNOTATION_STYLES
    : ANNOTATION_STYLES.filter((candidate) => candidate.id !== "text");

  return (
    <div className={`note-style-grid${showPreviews ? " note-style-grid-with-previews" : ""}`}>
      {styles.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          className={`note-style-button${selectedStyle === candidate.id ? " is-active" : ""}`}
          aria-label={candidate.label}
          aria-pressed={selectedStyle === candidate.id}
          onClick={() => onStyleChange(candidate.id)}
        >
          {showPreviews && <NoteStylePreview style={candidate.id} />}
          <strong>{candidate.label}</strong>
          <span className="note-style-description">{candidate.description}</span>
        </button>
      ))}
    </div>
  );
}

function NoteStylePreview({
  style,
  className = "",
}: {
  style: AnnotationStyle;
  className?: string;
}) {
  return (
    <span
      className={`note-style-preview note-style-preview-${style}${className ? ` ${className}` : ""}`}
      data-note-style-preview={style}
      aria-hidden="true"
    >
      {style === "paper" && (
        <>
          <span className="note-preview-fold" />
          <span className="note-preview-line note-preview-line-long" />
          <span className="note-preview-line note-preview-line-short" />
          <span className="note-preview-line note-preview-line-medium" />
        </>
      )}
      {style === "code" && (
        <>
          <span className="note-preview-code-line note-preview-code-line-long" />
          <span className="note-preview-code-line note-preview-code-line-medium" />
          <span className="note-preview-code-line note-preview-code-line-short" />
        </>
      )}
      {style === "text" && (
        <>
          <span className="note-preview-text-line note-preview-text-line-long">Text</span>
          <span className="note-preview-text-line note-preview-text-line-short">editable</span>
        </>
      )}
      {style === "callout" && (
        <>
          <span className="note-preview-callout-mark">i</span>
          <span className="note-preview-callout-line note-preview-callout-line-long" />
          <span className="note-preview-callout-line note-preview-callout-line-short" />
        </>
      )}
      {style === "checklist" && (
        <>
          <span className="note-preview-check-row"><i>✓</i><b /></span>
          <span className="note-preview-check-row"><i /><b /></span>
          <span className="note-preview-check-row"><i /><b /></span>
        </>
      )}
    </span>
  );
}

function ConnectorDrawer({ pendingPort }: { pendingPort: PendingPort }) {
  return (
    <div className="callout">
      {pendingPort ? (
        <>
          Starting at <strong>{pendingPort.nodeId}</strong> ·{" "}
          {pendingPort.side.toUpperCase()} {Math.round(pendingPort.offset * 100)}%. Pick a target port.
        </>
      ) : (
        <>Select a source port, then a target port on another icon.</>
      )}
    </div>
  );
}

const INSPECTOR_KIND_LABELS: Record<SelectionItem["kind"], string> = {
  resource: "Service",
  group: "Boundary",
  edge: "Connection",
  annotation: "Note",
};

const BOUNDARY_COLOR_OPTIONS: Array<{ id: EdgeColor; label: string }> = [
  { id: "graphite", label: "Navy" },
  { id: "blue", label: "Slate" },
  { id: "teal", label: "Teal" },
  { id: "purple", label: "Purple" },
  { id: "amber", label: "Orange" },
  { id: "red", label: "Coral" },
  { id: "green", label: "Green" },
];

function Inspector({
  doc,
  layout,
  selection,
  onRename,
  onLimitError,
  onAlign,
  onDistribute,
  onSetIconSize,
  onSetResourceLabelPosition,
  onSetGroupLabelPosition,
  onSetGroupIconHidden,
  onSetBoundaryAppearance,
  onSetAnnotationStyle,
  onSetTextFormat,
  onUpdateGroupStep,
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
  onLimitError: (message: string) => void;
  onAlign: (axis: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onSetIconSize: (size: ResourceIconSize) => void;
  onSetResourceLabelPosition: (position: ResourceLabelPosition) => void;
  onSetGroupLabelPosition: (position: GroupLabelPosition) => void;
  onSetGroupIconHidden: (hidden: boolean) => void;
  onSetBoundaryAppearance: (patch: { style?: EdgeStyle; color?: EdgeColor; fill?: BoundaryFill }) => void;
  onSetAnnotationStyle: (style: AnnotationStyle) => void;
  onSetTextFormat: (format: { font?: TextFontFamily; fontSize?: number; align?: TextAlign }) => void;
  onUpdateGroupStep: (step?: number) => void;
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
  const canHideGroupIcon = Boolean(
    group?.type &&
    group.type !== "cloud-agnostic.boundary" &&
    getCatalogEntry(group.type)?.provider === "cloud-agnostic",
  );
  const annotation = item?.kind === "annotation"
    ? doc.annotations.find((candidate) => candidate.id === item.id)
    : undefined;
  const routePinned = Boolean(item && doc.views[0]?.routes[item.id]?.pin);

  const resourceServiceLabel = resource
    ? layout.nodes.find((candidate) => candidate.id === resource.id)?.serviceLabel
    : undefined;
  const title =
    resource?.label.role ??
    resource?.label.service ??
    resourceServiceLabel ??
    group?.label ??
    edge?.label ??
    annotation?.text ??
    edge?.id ??
    item?.id ??
    `${selection.length} selected`;

  const editableLabel = resource ? resource.label.role ?? "" : title;
  const [labelDraft, setLabelDraft] = useState(editableLabel);
  useEffect(() => setLabelDraft(editableLabel), [editableLabel]);
  const authoredResourceLabelPosition: ResourceLabelPosition =
    resource?.label.position === "top" ? "top" : "bottom";
  const [resourceLabelPositionDraft, setResourceLabelPositionDraft] =
    useState<ResourceLabelPosition>(authoredResourceLabelPosition);
  useEffect(() => {
    setResourceLabelPositionDraft(authoredResourceLabelPosition);
  }, [resource?.id, authoredResourceLabelPosition]);
  const authoredResourceIconSize = resource ? resourceIconSize(resource) : "normal";
  const [resourceIconSizeDraft, setResourceIconSizeDraft] =
    useState<ResourceIconSize>(authoredResourceIconSize);
  useEffect(() => {
    setResourceIconSizeDraft(authoredResourceIconSize);
  }, [resource?.id, authoredResourceIconSize]);
  const authoredGroupLabelPosition: GroupLabelPosition =
    group?.labelPosition?.endsWith("right") ? "top-right" : "top-left";
  const [groupLabelPositionDraft, setGroupLabelPositionDraft] =
    useState<GroupLabelPosition>(authoredGroupLabelPosition);
  useEffect(() => {
    setGroupLabelPositionDraft(authoredGroupLabelPosition);
  }, [group?.id, authoredGroupLabelPosition]);

  return (
    <FloatingPanel
      className="inspector-sheet"
      title={title}
      subtitle={
        selection.length > 1
          ? `${selection.length} selected`
          : item
            ? item.kind === "annotation" && annotation && annotationStyle(annotation) === "text"
              ? "Text"
              : INSPECTOR_KIND_LABELS[item.kind]
            : "Selection"
      }
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
          <label htmlFor="inspector-label">{annotation ? "Content" : "Display label"}</label>
          {annotation ? (
            <textarea
              id="inspector-label"
              value={labelDraft}
              maxLength={DIAGRAM_LIMITS.annotationCharacters}
              rows={5}
              onChange={(event) => setLabelDraft(event.target.value)}
              onPaste={(event) => rejectOversizedPaste(event, DIAGRAM_LIMITS.annotationCharacters, () => onLimitError(`Notes are limited to ${DIAGRAM_LIMITS.annotationCharacters} characters`))}
              onBlur={() => onRename(labelDraft)}
              aria-describedby="inspector-label-limit"
            />
          ) : (
            <input
              id="inspector-label"
              value={labelDraft}
              placeholder={resource ? "Optional label" : undefined}
              maxLength={DIAGRAM_LIMITS.labelCharacters}
              onChange={(event) => setLabelDraft(event.target.value)}
              onPaste={(event) => rejectOversizedPaste(event, DIAGRAM_LIMITS.labelCharacters, () => onLimitError(`Labels are limited to ${DIAGRAM_LIMITS.labelCharacters} characters`))}
              onBlur={() => onRename(labelDraft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-describedby="inspector-label-limit"
            />
          )}
          <span id="inspector-label-limit" className="input-limit" aria-live="polite">
            {characterLength(labelDraft)} / {annotation ? DIAGRAM_LIMITS.annotationCharacters : DIAGRAM_LIMITS.labelCharacters}
          </span>
        </div>
      )}
      {annotation && (
        <div className="property-section">
          <label>Note style</label>
          <NoteStyleOptions
            selectedStyle={annotationStyle(annotation)}
            onStyleChange={onSetAnnotationStyle}
          />
        </div>
      )}
      {annotation && annotationStyle(annotation) === "text" && (
        <TextFormattingControls
          idPrefix="inspector"
          font={annotation.font ?? "sans"}
          fontSize={annotation.fontSize ?? 14}
          align={annotation.align ?? "left"}
          onChange={onSetTextFormat}
        />
      )}
      {resource && (
        <div className="property-section">
          <label>Icon size</label>
          <div className="button-pair">
            <button
              type="button"
              className={resourceIconSizeDraft === "normal" ? "is-active" : ""}
              onClick={() => {
                setResourceIconSizeDraft("normal");
                onSetIconSize("normal");
              }}
            >
              Normal ({GRAMMAR.iconPrimary}px)
            </button>
            <button
              type="button"
              className={resourceIconSizeDraft === "small" ? "is-active" : ""}
              onClick={() => {
                setResourceIconSizeDraft("small");
                onSetIconSize("small");
              }}
            >
              Small ({GRAMMAR.iconSecondary}px)
            </button>
          </div>
        </div>
      )}
      {resource && (
        <div className="property-section">
          <label htmlFor="resource-label-position">Display label position</label>
          <select
            id="resource-label-position"
            value={resourceLabelPositionDraft}
            onChange={(event) => {
              const position = event.target.value as ResourceLabelPosition;
              setResourceLabelPositionDraft(position);
              onSetResourceLabelPosition(position);
            }}
          >
            <option value="top">Above icon</option>
            <option value="bottom">Below icon</option>
          </select>
          <p className="property-hint">Automatic connectors avoid the side occupied by the label.</p>
        </div>
      )}
      {group && (
        <div className="property-section">
          <label htmlFor="group-label-position">Display label position</label>
          <select
            id="group-label-position"
            value={groupLabelPositionDraft}
            onChange={(event) => {
              const position = event.target.value as GroupLabelPosition;
              setGroupLabelPositionDraft(position);
              onSetGroupLabelPosition(position);
            }}
          >
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
          </select>
        </div>
      )}
      {group && (
        <div className="property-section boundary-appearance-section">
          <label>Boundary line</label>
          <div className="button-pair" role="radiogroup" aria-label="Boundary line style">
            {(["solid", "dashed"] as EdgeStyle[]).map((style) => {
              const inheritedStyle = ["region", "az", "logical", "overlay"].includes(group.kind)
                ? "dashed"
                : "solid";
              const selected = (group.style ?? inheritedStyle) === style;
              return (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? "is-active" : ""}
                  onClick={() => onSetBoundaryAppearance({ style })}
                >
                  {style === "solid" ? "Solid" : "Dashed"}
                </button>
              );
            })}
          </div>
          <label>Boundary color</label>
          <div className="edge-color-options boundary-color-options" role="radiogroup" aria-label="Boundary color">
            <button
              className={`edge-color-option edge-color-auto${group.color === undefined ? " is-active" : ""}`}
              type="button"
              role="radio"
              aria-checked={group.color === undefined}
              onClick={() => onSetBoundaryAppearance({ color: undefined })}
              title="Use the boundary type's automatic color"
            >
              <span className="edge-color-swatch is-auto" aria-hidden="true" />
              <span>Auto</span>
            </button>
            {BOUNDARY_COLOR_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`edge-color-option${group.color === option.id ? " is-active" : ""}`}
                type="button"
                role="radio"
                aria-checked={group.color === option.id}
                onClick={() => onSetBoundaryAppearance({ color: option.id })}
                title={option.label}
              >
                <span className="edge-color-swatch" style={{ backgroundColor: EDGE_COLOR_VALUES[option.id] }} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
          <label>Interior fill</label>
          <div className="button-pair" role="radiogroup" aria-label="Boundary fill">
            {(["subtle", "none"] as BoundaryFill[]).map((fill) => {
              const selected = (group.fill ?? "subtle") === fill;
              return (
                <button
                  key={fill}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? "is-active" : ""}
                  onClick={() => onSetBoundaryAppearance({ fill })}
                >
                  {fill === "subtle" ? "Subtle" : "None"}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {group && canHideGroupIcon && (
        <div className="property-section">
          <label>Boundary icon</label>
          <div className="button-pair">
            <button
              type="button"
              className={group.hideIcon ? "" : "is-active"}
              onClick={() => onSetGroupIconHidden(false)}
            >
              Show icon
            </button>
            <button
              type="button"
              className={group.hideIcon ? "is-active" : ""}
              onClick={() => onSetGroupIconHidden(true)}
            >
              Hide icon
            </button>
          </div>
          <p className="property-hint">Hide the semantic icon while keeping this boundary type.</p>
        </div>
      )}
      {group && (
        <div className="property-section">
          <label htmlFor="group-step">Boundary number</label>
          <div className="edge-badge-editor">
            <input
              id="group-step"
              aria-label="Boundary number"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_EDGE_STEP}
              step={1}
              placeholder="Add number"
              value={group.step ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                if (!raw) return onUpdateGroupStep(undefined);
                if (!/^\d+$/.test(raw)) return;
                const value = Number(raw);
                if (Number.isSafeInteger(value) && value <= MAX_EDGE_STEP) onUpdateGroupStep(value);
              }}
            />
            <button
              className="text-button"
              type="button"
              onClick={() => onUpdateGroupStep(group.step === undefined ? 1 : undefined)}
            >
              {group.step === undefined ? "Add" : "Remove"}
            </button>
          </div>
          <p className="property-hint">Whole numbers only: 0–99.</p>
        </div>
      )}
      {group && (
        <details className="inspector-advanced">
          <summary>Advanced details</summary>
          <div className="inspector-advanced-body">
            <div className="inspector-detail">
              <span className="inspector-detail-label">Boundary kind</span>
              <div className="readonly-value">{group.kind}</div>
            </div>
            <div className="inspector-detail">
              <span className="inspector-detail-label">Children</span>
              <div className="readonly-value">{group.children.length}</div>
            </div>
          </div>
        </details>
      )}
      {resource && (
        <details className="inspector-advanced">
          <summary>Advanced details</summary>
          <div className="inspector-advanced-body">
            <div className="inspector-detail">
              <span className="inspector-detail-label">Resource type</span>
              <code className="readonly-value">{resource.type}</code>
            </div>
            <div className="inspector-detail">
              <span className="inspector-detail-label">Parent group</span>
              <div className="readonly-value">
                {resource.parent
                  ? doc.groups.find((candidate) => candidate.id === resource.parent)?.label ?? resource.parent
                  : "Canvas"}
              </div>
            </div>
          </div>
        </details>
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
              <option value="bidirectional">Bidirectional</option>
              <option value="peer">Peer</option>
              <option value="fail">Failure</option>
            </select>
          </div>
          <div className="property-section">
            <label>Route</label>
            <button className="wide-button" type="button" onClick={routePinned ? onAutoRoute : onPinRoute}>
              {routePinned ? "Use auto route" : "Pin current route"}
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

function containsPoint(
  rect: { x: number; y: number; w: number; h: number },
  point: Point,
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

function snap(value: number): number {
  return Math.round(value / 8) * 8;
}

function buildContextMenuItems(
  selection: Selection,
  doc: DiagramDocument,
  actions: {
    onCopy: () => void;
    onCut: () => void;
    onPaste: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onMutate: (change: (doc: DiagramDocument) => DiagramDocument) => void;
  },
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  const hasSelection = selection.length > 0;

  if (hasSelection) {
    items.push(
      {
        id: "copy",
        label: "Copy",
        shortcut: "⌘C / Ctrl+C",
        onSelect: actions.onCopy,
      },
      {
        id: "cut",
        label: "Cut",
        shortcut: "⌘X / Ctrl+X",
        onSelect: actions.onCut,
      },
      {
        id: "duplicate",
        label: "Duplicate",
        shortcut: "⌘D / Ctrl+D",
        onSelect: actions.onDuplicate,
      },
      { id: "selection-divider", label: "", separator: true },
    );
  }

  items.push({
    id: "paste",
    label: "Paste image or selection",
    shortcut: "⌘V / Ctrl+V",
    onSelect: actions.onPaste,
  });

  if (!hasSelection) return items;

  if (selection.length === 1) {
    const item = selection[0]!;
    const view = doc.views[0];
    const place =
      item.kind === "annotation"
        ? view?.annotations?.[item.id]
        : view?.places[item.id];
    const locked = Boolean(place?.locked);

    items.push({ id: "object-divider", label: "", separator: true });
    items.push({
      id: "front",
      label: "Bring to front",
      onSelect: () => actions.onMutate((next) => sendToFront(next, item.id)),
    });
    items.push({
      id: "back",
      label: "Send to back",
      onSelect: () => actions.onMutate((next) => sendToBack(next, item.id)),
    });
    items.push({
      id: "lock",
      label: locked ? "Unlock position" : "Lock position",
      onSelect: () =>
        actions.onMutate((next) =>
          setLocked(
            next,
            item.kind as "resource" | "group" | "edge" | "annotation",
            item.id,
            !locked,
          ),
        ),
    });
  }

  items.push({ id: "delete-divider", label: "", separator: true });
  items.push({
    id: "delete",
    label:
      selection.length > 1
        ? `Delete ${selection.length} items`
        : selection[0]?.kind === "edge"
          ? "Delete connector"
          : "Delete",
    shortcut: "⌫ / Delete",
    danger: true,
    onSelect: actions.onDelete,
  });

  return items;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
