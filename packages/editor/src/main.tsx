import {
  lazy,
  memo,
  StrictMode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { createRoot } from "react-dom/client";

import type {
  AnnotationStyle,
  DiagramDocument,
  LayoutResult,
  Point,
  Side,
  TextAlign,
  TextFontFamily,
} from "@dumb-diagrams/runtime/core";
import {
  createEmptyDocument,
  characterLength,
  DIAGRAM_LIMITS,
  normalizeMultilineText,
  normalizeSingleLineText,
} from "@dumb-diagrams/runtime/core";
import { parseDgmResult, printDgm } from "@dumb-diagrams/runtime/dsl";
import { renderPortableSvg } from "@dumb-diagrams/runtime/render";
import { normalizeOrthogonalRoute } from "@dumb-diagrams/runtime/route";

import { serializeClipboardResult, duplicateSelectionResult } from "./model/clipboard";
import type { Selection, SelectionItem } from "./model/types";
import { readClipboardSelection, writeClipboardText } from "./state/clipboard-actions";
import { importDocumentFiles, importSvgFile, validateImportedSource } from "./state/document-import";
import { clearDiagramHash, readDiagramUrlImport } from "./state/diagram-url-bootstrap";
import { useDocumentCommands } from "./state/use-document-commands";
import { createCatalogActions, insertionPoint } from "./state/catalog-actions";
import { useEditorSelection } from "./state/use-editor-selection";
import { groupSelection, canGroupSelection, ungroup } from "./model/grouping";
import { useFileActions, type FilePickerWindow } from "./state/use-file-actions";
import { useStudioShortcuts } from "./interactions/use-studio-shortcuts";
import { Inspector } from "./panels/Inspector";
import { NoteComposer, TextComposer } from "./panels/AnnotationControls";
import { buildContextMenuItems } from "./panels/canvas-context-menu";
import { rejectOversizedPaste } from "./ui/text-input";

import {
  addAnnotation,
  addText,
  annotationSize,
  addEdge,
  alignSelection,
  clearRoute,
  deleteSelection,
  distributeSelection,
  fitGroupToContents,
  nudgeSelection,
  primarySelection,
  reconnectEdge,
  renameEdge,
  renameGroup,
  renameResource,
  updateGroupStep,
  setResourceIconSize,
  setResourceLabelPosition,
  setGroupLabelPosition,
  setGroupIconHidden,
  setBoundaryAppearance,
  setRoute,
  setSize,
  setTitle,
  setLocked,
  setVisible,
  sendToFront,
  sendToBack,
  setEdgeBadgePosition,
  setEdgeLabelPosition,
  swapEdgeDirection,
  updateEdge,
  updateEdgePreservingLayout,
  moveSelection,
  removeSelectionPreservingGroupContents,
  setGroupBounds,
  updateAnnotationText,
  updateTextFormat,
  setAnnotationStyle,
} from "./editor-model";
import { CanvasStage, clampZoom, defaultViewportForContent, type CanvasMarqueeGesture } from "./canvas/CanvasStage";
import { InteractionOverlay } from "./interactions/InteractionOverlay";
import { type SelectionMode } from "./interactions/selection-targeting";
import { CATALOG_DRAG_MIME, parseCatalogDragPayload } from "./catalog-dnd";
import { AssetBrowser } from "./panels/AssetBrowser";
import { ContextMenu, type ContextMenuItem } from "./panels/ContextMenu";
import { EdgePanel } from "./panels/EdgePanel";
import { EntityNavigator, type NavigableEntity } from "./panels/EntityNavigator";
import { ExportDialog } from "./panels/ExportDialog";
import { ExportMenu } from "./panels/ExportMenu";
import { HelpModal } from "./panels/HelpModal";
import { CommandPalette, type Command } from "./panels/CommandPalette";
import type { DiagramExample } from "./examples";
import { LayersPanel } from "./panels/LayersPanel";
import { RecycleBinModal } from "./panels/RecycleBinModal";
import { WorkspaceTabs } from "./panels/WorkspaceTabs";
import { readFileHandles, type OpenFileEntry } from "./state/file-open";
import { exportDgmFileResult, filenameWithExtension, type ExportFormat } from "./state/export-actions";
import {
  isTabDirty,
  isDisposableTab,
  isProtectedDefaultTab,
  MAX_WORKSPACE_TABS,
  normalizeWorkspacePreview,
  useWorkspace,
  type WorkspacePreviewMap,
  type WorkspaceTab,
} from "./state/workspace";
import { FloatingPanel } from "./ui/FloatingPanel";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { IssueJournal, type StudioIssue } from "./ui/IssueJournal";
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
import { getCachedDiagramCompilation, type DiagramCompilation } from "./diagram-compiler";
import { GRID_SIZE, leftStagingInsertionPoint, snapPoint } from "./grid.js";
import "./styles.css";

initTheme();

const BLANK_SOURCE = printDgm(createEmptyDocument("untitled-diagram"));
const INITIAL_VIEWPORT = defaultViewportForContent(0, 0);
const TAB_CLOSE_FALLBACK_MS = 500;
const LEFT_DRAWER_CLOSE_FALLBACK_MS = 220;
const LEFT_DRAWER_WIDTH = 420;

const LEFT_DRAWER_TOOLS = new Set<ToolId>(["note", "text", "resources", "groups", "connector", "code", "layers"]);

function isLeftDrawerTool(tool: ToolId): boolean {
  return LEFT_DRAWER_TOOLS.has(tool);
}
const RenderedDiagram = memo(function RenderedDiagram({ svg }: { svg: string }) {
  return <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
});

const SourceDrawer = lazy(() =>
  import("./panels/SourceDrawer").then((module) => ({
    default: module.SourceDrawer,
  })),
);
const ExamplesModal = lazy(() =>
  import("./panels/ExamplesModal").then((module) => ({
    default: module.ExamplesModal,
  })),
);
const INITIAL_URL_IMPORT = typeof window === "undefined" ? {} : readDiagramUrlImport(window.location.hash);

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
type OperationState = {
  label: string;
  completed?: number;
  total?: number;
  blocking?: boolean;
  awaitSource?: string;
} | null;

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
    editSourceDraft,
    commitSourceDraft,
    commitSource,
    resetTab,
    resetActive,
    beginTransaction,
    endTransaction,
    cancelTransaction,
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
    persistenceWarning,
  } = useWorkspace({
    initialSource: INITIAL_URL_IMPORT.source ?? BLANK_SOURCE,
    initialSavedSource: INITIAL_URL_IMPORT.source ? "" : BLANK_SOURCE,
    initialOrigin: INITIAL_URL_IMPORT.source ? "import" : "new",
    initialViewport: INITIAL_VIEWPORT,
    blankSource: BLANK_SOURCE,
  });
  const [tool, setTool] = useState<Tool>("select");
  const interactionTool = canvasInteractionTool(tool);
  const editorSelection = useEditorSelection();
  const { selection, setSelection } = editorSelection;
  const [stageMarquee, setStageMarquee] = useState<CanvasMarqueeGesture | null>(null);
  const [textEditRequest, setTextEditRequest] = useState<SelectionItem | null>(null);
  const [pendingPort, setPendingPort] = useState<PendingPort>(null);
  const [defaultFrameKey, setDefaultFrameKey] = useState(0);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const activeTabRef = useRef(activeTabId);
  activeTabRef.current = activeTabId;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [openingExampleId, setOpeningExampleId] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [exportDialogFormat, setExportDialogFormat] = useState<ExportFormat | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsDraft, setSaveAsDraft] = useState("");
  const [fileConflictRequest, setFileConflictRequest] = useState<{
    tabId: string;
    filename: string;
    diskSource: string;
  } | null>(null);
  const [closeRequest, setCloseRequest] = useState<string | null>(null);
  const [resetExampleOpen, setResetExampleOpen] = useState(false);
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const closeAnimationTimerRef = useRef<number | null>(null);
  const [closingLeftDrawer, setClosingLeftDrawer] = useState<ToolId | null>(null);
  const drawerCloseAnimationTimerRef = useRef<number | null>(null);
  const pendingClosePreviewsRef = useRef<WorkspacePreviewMap>({});
  const [operation, setOperation] = useState<OperationState>(null);
  const initialUrlHandledRef = useRef(false);

  useEffect(() => {
    return () => {
      if (closeAnimationTimerRef.current !== null) {
        window.clearTimeout(closeAnimationTimerRef.current);
      }
      if (drawerCloseAnimationTimerRef.current !== null) {
        window.clearTimeout(drawerCloseAnimationTimerRef.current);
      }
    };
  }, []);

  const setToast = (message: string | null) => {
    if (message !== null) setToastNonce((current) => current + 1);
    setToastMessage(message);
  };

  const documentCommands = useDocumentCommands({
    source,
    tabId: activeTabId,
    snapToGrid,
    commitSource,
    replaceSource,
    editSourceDraft,
    commitSourceDraft,
    notify: setToast,
  });
  const {
    sourceRef,
    committedCompilationKey,
    mutateCurrent,
    previewMutate,
    onSourceChange,
    onSourceCommit,
    clearDraftTimer,
    commitDocument: updateDocument,
  } = documentCommands;

  const tabLabel = useCallback((tab: WorkspaceTab): string => {
    const parsed = parseDgmResult(tab.source);
    return parsed.isOk()
      ? documentNameForDisplay(parsed.value)
      : tab.filename?.replace(/\.dgm$/i, "") || "Untitled diagram";
  }, []);

  const sourceIsValid = (candidate: string): boolean => validateImportedSource(candidate, false).isOk();

  const { saveTabSource, attachFileHandle } = useFileActions({
    tabs,
    tabLabel,
    sourceIsValid,
    onMessage: setToast,
    onSaved: markTabSaved,
    onConflict: setFileConflictRequest,
  });

  const saveActive = () => {
    if (!currentSourceValid) return;
    void saveTabSource(activeTab.id);
  };

  const exportCurrentSource = () => {
    exportDgmFileResult(source, tabLabel(activeTab)).match(
      (receipt) => setToast(`Downloaded ${receipt.filename}`),
      (error) => setToast(`Source export failed: ${error.message}`),
    );
  };

  const openSaveAs = () => {
    if (!currentSourceValid) return;
    const picker = (window as FilePickerWindow).showSaveFilePicker;
    if (!picker) {
      setSaveAsDraft(activeTab.filename || filenameWithExtension(tabLabel(activeTab), "dgm"));
      setSaveAsOpen(true);
      return;
    }
    void saveTabSource(activeTab.id, activeTab.filename || filenameWithExtension(tabLabel(activeTab), "dgm"));
  };

  const confirmSaveAs = async () => {
    const filename = normalizeSingleLineText(saveAsDraft);
    if (!filename) {
      setToast("Filename cannot be empty");
      return;
    }
    setSaveAsDraft(filename);
    const result = await saveTabSource(activeTab.id, filename);
    if (result.status === "saved") setSaveAsOpen(false);
  };

  const resetTransientState = () => {
    editorSelection.resetSelection();
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
    clearDraftTimer();
    resetActive(activeTab.initialSource, activeTab.initialSource, {
      initialSource: activeTab.initialSource,
      origin: "example",
      filename: activeTab.filename,
    });
    resetTransientState();
    setDefaultFrameKey((current) => current + 1);
    setResetExampleOpen(false);
    setToast("Example reset");
  };

  const tabLimitMessage = `You can have up to ${MAX_WORKSPACE_TABS} open diagrams. Close a tab to create another.`;

  const renderTabPreview = useCallback(
    (tab: WorkspaceTab): string | undefined => {
      const compilation = getCachedDiagramCompilation(tab.source, snapToGrid);
      return compilation?.ok ? normalizeWorkspacePreview(compilation.svg) : undefined;
    },
    [snapToGrid],
  );

  const previewsForTabs = useCallback(
    (targetTabs: WorkspaceTab[]): WorkspacePreviewMap => {
      const previews: Record<string, string | undefined> = {};
      for (const tab of targetTabs) previews[tab.id] = renderTabPreview(tab);
      return previews;
    },
    [renderTabPreview],
  );

  const consumeClosingPreviews = () => {
    const previews = pendingClosePreviewsRef.current;
    pendingClosePreviewsRef.current = {};
    return previews;
  };

  const beginTabClose = (tabId: string, previewByTabId: WorkspacePreviewMap = {}) => {
    if (closingTabId || !tabs.some((tab) => tab.id === tabId)) return;
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

  const clearLeftDrawerClose = () => {
    if (drawerCloseAnimationTimerRef.current !== null) {
      window.clearTimeout(drawerCloseAnimationTimerRef.current);
      drawerCloseAnimationTimerRef.current = null;
    }
    setClosingLeftDrawer(null);
  };

  const beginLeftDrawerClose = (drawerTool: ToolId) => {
    setClosingLeftDrawer(drawerTool);
    setTool("select");
    if (drawerTool === "connector") setPendingPort(null);
    if (drawerCloseAnimationTimerRef.current !== null) {
      window.clearTimeout(drawerCloseAnimationTimerRef.current);
    }
    drawerCloseAnimationTimerRef.current = window.setTimeout(() => {
      drawerCloseAnimationTimerRef.current = null;
      setClosingLeftDrawer((current) => (current === drawerTool ? null : current));
    }, LEFT_DRAWER_CLOSE_FALLBACK_MS);
  };

  const finishLeftDrawerClose = (drawerTool: ToolId) => {
    if (drawerCloseAnimationTimerRef.current !== null) {
      window.clearTimeout(drawerCloseAnimationTimerRef.current);
      drawerCloseAnimationTimerRef.current = null;
    }
    window.requestAnimationFrame(() => {
      setClosingLeftDrawer((current) => (current === drawerTool ? null : current));
    });
  };

  const requestLeftDrawerClose = (drawerTool: ToolId) => {
    if (closingLeftDrawer === drawerTool) return;
    beginLeftDrawerClose(drawerTool);
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
    if (closingTabId) return;
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    if (isProtectedDefaultTab(tabs, BLANK_SOURCE, tabId)) return;
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
    const result = await saveTabSource(tabId);
    if (result.status === "saved") {
      setCloseRequest(null);
      beginTabClose(tabId, tab ? previewsForTabs([tab]) : {});
    }
  };

  const reloadConflictingFile = () => {
    const request = fileConflictRequest;
    if (!request) return;
    const tab = tabs.find((candidate) => candidate.id === request.tabId);
    if (!tab) {
      setFileConflictRequest(null);
      setToast("The conflicting diagram tab is no longer open.");
      return;
    }
    setFileConflictRequest(null);
    resetTab(request.tabId, request.diskSource, request.diskSource);
    if (request.tabId === activeTabId) {
      resetTransientState();
      setDefaultFrameKey((current) => current + 1);
    }
    setToast(`Reloaded ${request.filename} from disk`);
    if (closeRequest === request.tabId) {
      setCloseRequest(null);
      beginTabClose(request.tabId, previewsForTabs([tab]));
    }
  };

  const overwriteConflictingFile = async () => {
    const request = fileConflictRequest;
    if (!request) return;
    setFileConflictRequest(null);
    const result = await saveTabSource(request.tabId, undefined, { overwriteExisting: true });
    if (result.status === "saved" && closeRequest === request.tabId) {
      const tab = tabs.find((candidate) => candidate.id === request.tabId);
      setCloseRequest(null);
      beginTabClose(request.tabId, tab ? previewsForTabs([tab]) : {});
    }
  };

  const openFileEntries = async (entries: OpenFileEntry[], initiallyRejected: string[] = []) => {
    if (!entries.length && !initiallyRejected.length) return;
    // FileList is live and is cleared by the input after this handler returns.
    // Snapshot it before yielding so the browser can paint the progress state.
    const inputFiles = entries;
    setOperation({
      label: `Opening ${inputFiles.length} diagram${inputFiles.length === 1 ? "" : "s"}…`,
      blocking: true,
    });
    await waitForPaint();
    let openedAny = false;
    try {
      const { opened, rejected, unexpected, limitReached } = await importDocumentFiles(
        inputFiles,
        Math.max(0, MAX_WORKSPACE_TABS - tabs.length),
        ({ source: candidate, filename }, { handle }) => {
          const tabId = openTab(candidate, { filename, origin: "import" });
          if (!tabId) return false;
          if (handle) attachFileHandle(tabId, handle);
          setOperation((current) => (current ? { ...current, awaitSource: candidate } : current));
          openedAny = true;
          return true;
        },
        waitForPaint,
        initiallyRejected,
      );
      if (opened.length) {
        resetTransientState();
        setToast(`Opened ${opened.length} diagram${opened.length === 1 ? "" : "s"}`);
      }
      if (rejected.length) {
        setToast(
          `Rejected ${rejected.slice(0, 3).join(", ")}${rejected.length > 3 ? ` and ${rejected.length - 3} more` : ""}: unreadable or invalid .dgm source`,
        );
      }
      if (limitReached) setToast(tabLimitMessage);
      if (unexpected.length) {
        for (const failure of unexpected) {
          console.error(`Document import failed for ${failure.filename}`, failure.error.cause);
        }
        setToast(
          `Import failed unexpectedly for ${unexpected
            .slice(0, 3)
            .map((failure) => failure.filename)
            .join(
              ", ",
            )}${unexpected.length > 3 ? ` and ${unexpected.length - 3} more` : ""}. Previously opened diagrams were preserved.`,
        );
      }
    } catch (cause) {
      console.error("Document import failed", cause);
      setToast("Import failed unexpectedly. Previously opened diagrams were preserved.");
    } finally {
      if (!openedAny) setOperation(null);
    }
  };

  const handleOpenFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await openFileEntries(Array.from(files).map((file) => ({ file })));
  };

  const openFromDisk = async () => {
    const picker = (window as FilePickerWindow).showOpenFilePicker;
    if (!picker) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const handles = await picker({
        multiple: true,
        types: [{ description: "DumbDiagrams source", accept: { "text/plain": [".dgm"] } }],
      });
      const { entries, rejected } = await readFileHandles(handles);
      await openFileEntries(entries, rejected);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setToast(error instanceof Error ? error.message : "Unable to open the selected diagram.");
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
    const request = bulkCloseRequest;
    const tabIndex = tabs.findIndex((tab) => tab.id === request.tabId);
    const targets = request.kind === "all" ? tabs : tabIndex < 0 ? [] : tabs.slice(tabIndex + 1);
    setOperation({ label: "Closing diagrams…", completed: 0, total: targets.length });
    setBulkCloseRequest(null);
    await waitForPaint();
    try {
      const previews: Record<string, string | undefined> = {};
      for (const [index, tab] of targets.entries()) {
        // Recycle-bin thumbnails are optional. Reuse work the editor has
        // already completed, but never block closing to lay out and route a
        // diagram again just to create a thumbnail.
        previews[tab.id] = renderTabPreview(tab);
        setOperation({ label: "Closing diagrams…", completed: index + 1, total: targets.length });
        await waitForPaint();
      }
      const closedCount = request.kind === "all" ? closeAllTabs(previews) : closeTabsToRight(request.tabId, previews);
      const recoverableCount = targets.filter((tab) => !isDisposableTab(tab, BLANK_SOURCE)).length;
      resetTransientState();
      if (closedCount) {
        setToast(
          recoverableCount
            ? `${recoverableCount} diagram${recoverableCount === 1 ? "" : "s"} moved to the recycle bin`
            : `${closedCount} diagram${closedCount === 1 ? "" : "s"} closed`,
        );
      }
    } finally {
      await waitForPaint();
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

  const openExampleInTab = async (example: DiagramExample) => {
    if (tabs.length >= MAX_WORKSPACE_TABS) {
      setToast(tabLimitMessage);
      return;
    }
    setOpeningExampleId(example.id);
    setOperation({ label: `Opening ${example.title}…`, blocking: true, awaitSource: example.source });
    let opened = false;
    await waitForPaint();
    try {
      if (
        !openTab(example.source, {
          initialSource: example.source,
          filename: `${example.id}.dgm`,
          origin: "example",
        })
      ) {
        setToast(tabLimitMessage);
        return;
      }
      setExamplesOpen(false);
      setHelpOpen(false);
      resetTransientState();
      setToast(`Opened ${example.title}`);
      opened = true;
    } finally {
      setOpeningExampleId(null);
      if (!opened) setOperation(null);
    }
  };

  const { compilation: rawCompiled, pending: compilationPending } = useDiagramCompilation(source, snapToGrid);
  const compiledFromCache = useMemo(() => {
    void committedCompilationKey;
    const committed = getCachedDiagramCompilation(sourceRef.current, snapToGrid);
    if (committed) return committed;
    const cached = getCachedDiagramCompilation(source, snapToGrid);
    return cached ?? rawCompiled;
  }, [committedCompilationKey, rawCompiled, snapToGrid, source]);

  const displayCompiled = compiledFromCache.ok ? compiledFromCache : lastGoodRef.current;

  const parsedDoc = useMemo(() => parseDgmResult(source).unwrapOr(null), [source]);

  const compiled = useMemo((): DiagramCompilation => {
    if (compiledFromCache.ok) return compiledFromCache;
    if (!parsedDoc || !displayCompiled) return compiledFromCache;
    const message =
      ("parseError" in compiledFromCache && compiledFromCache.parseError) ||
      compiledFromCache.issues.find((issue) => issue.level === "error")?.message ||
      compiledFromCache.issues[0]?.message;
    return {
      ok: true as const,
      doc: parsedDoc,
      layout: displayCompiled.layout,
      svg: displayCompiled.svg,
      issues: message ? [{ level: "warning" as const, code: "render-degraded", message }] : [],
      invariantFailures: [],
    };
  }, [compiledFromCache, displayCompiled, parsedDoc]);
  // `compiled` may intentionally pair a parseable repair document with the
  // last good geometry. This flag is the only source of truth for actions
  // that require the current source to be valid.
  const currentCompilation = compiledFromCache.ok ? compiledFromCache : null;
  const currentSourceValid = currentCompilation !== null;

  useEffect(() => {
    if (
      operation?.blocking &&
      operation.awaitSource !== undefined &&
      operation.awaitSource === source &&
      !compilationPending
    ) {
      setOperation(null);
    }
  }, [compilationPending, operation, source]);

  useEffect(() => {
    if (compiledFromCache.ok) lastGoodRef.current = compiledFromCache;
  }, [compiledFromCache]);

  useEffect(() => {
    lastGoodRef.current = null;
    resetTransientState();
  }, [activeTabId]);

  useEffect(() => {
    if (!workspaceReady || activeTab.viewportCustomized) return;
    setDefaultFrameKey((current) => current + 1);
  }, [activeTab.viewportCustomized, activeTabId, workspaceReady]);

  useEffect(() => {
    if (persistenceWarning) setToast(persistenceWarning);
  }, [persistenceWarning]);

  useEffect(() => {
    if (!workspaceReady || initialUrlHandledRef.current) return;
    initialUrlHandledRef.current = true;
    if (INITIAL_URL_IMPORT.source) {
      const existingTab = tabs.find((tab) => tab.source === INITIAL_URL_IMPORT.source);
      const alreadyOpen = Boolean(existingTab);
      if (!alreadyOpen && tabs.length >= MAX_WORKSPACE_TABS) {
        setToast(tabLimitMessage);
      } else {
        if (!alreadyOpen) {
          openTab(INITIAL_URL_IMPORT.source, { origin: "import" });
        } else if (existingTab) {
          setActiveTab(existingTab.id);
        }
        setToast(alreadyOpen ? "Opened diagram URL" : "Opened diagram from URL");
      }
    } else if (INITIAL_URL_IMPORT.error) {
      setToast(INITIAL_URL_IMPORT.error);
    }
    clearDiagramHash();
  }, [openTab, setActiveTab, tabs, workspaceReady]);

  const displayCanvas = displayCompiled
    ? (displayCompiled.layout.canvasBounds ?? {
        x: 0,
        y: 0,
        w: displayCompiled.layout.width,
        h: displayCompiled.layout.height,
      })
    : null;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast, toastNonce]);

  useEffect(() => {
    if (compiled.ok) setTitleDraft(documentNameForDisplay(compiled.doc));
  }, [compiled.ok, compiled.ok ? compiled.doc.title : "", compiled.ok ? compiled.doc.id : ""]);

  const selectItem = (item: SelectionItem, mode: SelectionMode) => {
    if (item.kind === "edge") setPendingPort(null);
    editorSelection.selectItem(item, mode);
  };

  const requestTextEdit = (item: SelectionItem) => {
    setSelection([item]);
    setTextEditRequest(item);
  };

  useEffect(() => {
    if (!textEditRequest) return;
    const fieldId =
      textEditRequest.kind === "edge"
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

  const journalIssues = useMemo<StudioIssue[]>(() => {
    const persistenceIssues: StudioIssue[] = persistenceWarning
      ? [{ severity: "warning", message: persistenceWarning }]
      : [];
    if (!compiledFromCache.ok) {
      if ("parseError" in compiledFromCache && compiledFromCache.parseError) {
        return [
          ...persistenceIssues,
          {
            severity: "error",
            message: compiledFromCache.parseError,
            location: compiledFromCache.parseErrorLocation,
          },
        ];
      }
      return [
        ...persistenceIssues,
        ...compiledFromCache.issues.map((issue) => ({
          severity: issue.level,
          message: issue.message,
          elementIds: issue.id ? [issue.id] : undefined,
        })),
      ];
    }
    if (!compiled.ok) {
      return [
        ...persistenceIssues,
        ...compiled.issues.map((issue) => ({ severity: "error" as const, message: issue.message })),
      ];
    }
    const active = compiled;
    return [
      ...persistenceIssues,
      ...active.issues.map((issue) => ({
        severity: issue.level,
        message: issue.message,
        elementIds: issue.id ? [issue.id] : undefined,
      })),
      ...active.invariantFailures.map((failure) => ({
        severity: "warning" as const,
        message: failure.message,
        elementIds: "elementIds" in failure && Array.isArray(failure.elementIds) ? failure.elementIds : undefined,
      })),
    ];
  }, [compiled, compiledFromCache, parsedDoc, persistenceWarning]);
  const issues = useMemo(() => journalIssues.map(({ message, location }) => ({ message, location })), [journalIssues]);

  const navigableEntities = useMemo<NavigableEntity[]>(() => {
    if (!compiled.ok) return [];
    return [
      ...compiled.doc.groups.map((group) => ({ kind: "group" as const, id: group.id, label: group.label })),
      ...compiled.doc.resources.map((resource) => ({
        kind: "resource" as const,
        id: resource.id,
        label: resource.label.service ?? resource.type,
      })),
      ...compiled.doc.edges.map((edge) => ({
        kind: "edge" as const,
        id: edge.id,
        label: edge.label || `Connector ${edge.id}`,
      })),
      ...compiled.doc.annotations.map((annotation) => ({
        kind: "annotation" as const,
        id: annotation.id,
        label: annotation.text || "Untitled note",
      })),
    ];
  }, [compiled]);

  const selectNavigatedEntity = (item: SelectionItem) => {
    setSelection([item]);
    setTool("select");
  };

  const focusCanvas = () => {
    document.querySelector<HTMLElement>('[data-testid="canvas-stage"]')?.focus();
  };

  const handleIssueSelect = (issue: StudioIssue) => {
    if (issue.severity === "error") {
      setTool("code");
      return;
    }
    if (!compiled.ok) return;
    const resourceIds = new Set(compiled.doc.resources.map((resource) => resource.id));
    const groupIds = new Set(compiled.doc.groups.map((group) => group.id));
    const edgeIds = new Set(compiled.doc.edges.map((edge) => edge.id));
    const nextSelection: Selection = [];
    for (const id of issue.elementIds ?? []) {
      if (resourceIds.has(id)) nextSelection.push({ kind: "resource", id });
      else if (groupIds.has(id)) nextSelection.push({ kind: "group", id });
      else if (edgeIds.has(id)) nextSelection.push({ kind: "edge", id });
    }
    if (!nextSelection.length) return;
    setSelection(nextSelection);
    if (tool !== "select") {
      setTool("select");
      setPendingPort(null);
    }
    fitRef.current?.();
  };

  const renameCurrent = () => {
    const title = normalizeSingleLineText(titleDraft);
    const prepared = documentCommands.mutate((doc) => setTitle(doc, title));
    if (!prepared) return;
    setTitleDraft(title);
    setTabFilename(activeTab.id, filenameWithExtension(documentNameForDisplay(prepared.doc), "dgm"));
  };

  const autoFix = () => {
    setPendingPort(null);
    void documentCommands.autoFix(compiled);
  };

  const selectMarquee = (rect: { x: number; y: number; w: number; h: number }, mode: SelectionMode) => {
    if (compiled.ok) editorSelection.selectMarquee(compiled.doc, compiled.layout, rect, mode);
  };
  const catalogActions = createCatalogActions({
    context: compiled.ok ? { doc: compiled.doc, layout: compiled.layout, selection, snapToGrid } : null,
    commit: updateDocument,
    selectInserted: (item) => {
      editorSelection.selectInserted(item);
      setTool("select");
    },
    notify: setToast,
  });
  const { addCatalogResource, addCatalogGroup, addBoundary } = catalogActions;

  const handleCatalogDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes(CATALOG_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleCatalogDrop = (event: ReactDragEvent<HTMLDivElement>, point: Point) => {
    const payload = event.dataTransfer.getData(CATALOG_DRAG_MIME);
    if (!parseCatalogDragPayload(payload)) return;
    event.preventDefault();
    catalogActions.drop(payload, point);
  };

  const openNoteComposer = () => {
    setNoteComposerStyle("paper");
    setPendingPort(null);
    setTool("note");
  };

  const createNote = (style: AnnotationStyle) => {
    if (!compiled.ok) return;
    const size = annotationSize(style);
    const at = snapPoint(leftStagingInsertionPoint(compiled.doc, compiled.layout, size.w), snapToGrid);
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
    const at = snapPoint(leftStagingInsertionPoint(compiled.doc, compiled.layout, 240), snapToGrid);
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
    connectPorts(pendingPort.nodeId, pendingPort.side, pendingPort.offset, nodeId, side, offset);
  };

  const copySelection = async (items: Selection = selection, showToast = true): Promise<boolean> => {
    if (!compiled.ok || !items.length) return false;
    try {
      const payload = serializeClipboardResult(compiled.doc, items);
      if (payload.isErr()) {
        setToast(payload.error.message);
        return false;
      }
      internalClipboardRef.current = payload.value;
      const written = await writeClipboardText(payload.value);
      if (showToast)
        setToast(
          written.isErr()
            ? "Copied selection internally; system clipboard access was unavailable."
            : "Copied selection",
        );
      return true;
    } catch (cause) {
      console.error("Clipboard copy failed", cause);
      setToast("Copy failed unexpectedly. Your diagram was not changed.");
      return false;
    }
  };

  const cutSelection = async (items: Selection = selection) => {
    if (!compiled.ok || !items.length) return;
    const tabId = activeTabId;
    const originalSource = sourceRef.current;
    if (!(await copySelection(items, false))) return;
    if (activeTabRef.current !== tabId || sourceRef.current !== originalSource) return;
    if (!mutateCurrent((doc) => deleteSelection(doc, items))) return;
    setSelection((current) =>
      current.filter((candidate) => !items.some((item) => item.kind === candidate.kind && item.id === candidate.id)),
    );
    setContextMenu(null);
    setToast("Cut selection");
  };

  const pasteSelection = async (requestedPoint?: Point) => {
    if (!compiled.ok) return;
    const tabId = activeTabId;
    const originalSource = sourceRef.current;
    const at = snapPoint(requestedPoint ?? insertionPoint(compiled.layout), snapToGrid);
    const result = await readClipboardSelection(compiled.doc, at, internalClipboardRef.current);
    if (activeTabRef.current !== tabId || sourceRef.current !== originalSource) return;
    if (result.isErr()) {
      if (result.error.code === "unexpected") console.error("Clipboard paste failed", result.error.cause);
      setToast(result.error.message);
      return;
    }
    if (!updateDocument(result.value.doc)) return;
    setSelection(result.value.selection);
    setContextMenu(null);
    setToast(
      result.value.kind === "image"
        ? "Pasted image"
        : result.value.usedFallback
          ? "Pasted selection from Studio clipboard; system clipboard access was unavailable."
          : "Pasted selection",
    );
  };

  const copySource = async () => {
    const result = await writeClipboardText(source);
    setToast(result.isErr() ? result.error.message : "Copied source");
  };

  const duplicateCurrentSelection = (items: Selection = selection) => {
    if (!compiled.ok || items.length === 0) return;
    const result = duplicateSelectionResult(compiled.doc, items);
    if (result.isErr()) {
      setToast(result.error.message);
      return;
    }
    if (!updateDocument(result.value.doc)) return;
    setSelection(result.value.selection);
    setContextMenu(null);
    setToast("Duplicated selection");
  };

  const removeCurrentSelection = (items: Selection = selection) => {
    if (!compiled.ok || items.length === 0) return;
    if (!mutateCurrent((doc) => removeSelectionPreservingGroupContents(doc, items, compiled.layout))) return;
    setSelection((current) =>
      current.filter((candidate) => !items.some((item) => item.kind === candidate.kind && item.id === candidate.id)),
    );
    setContextMenu(null);
    setToast("Deleted selection");
  };

  const fitCurrentGroup = (items: Selection = selection) => {
    if (!compiled.ok || items.length !== 1 || items[0]?.kind !== "group") return;
    const groupId = items[0].id;
    if (!mutateCurrent((doc) => fitGroupToContents(doc, groupId, compiled.layout))) return;
    setContextMenu(null);
    setToast("Fit group to contents");
  };

  const ungroupCurrentSelection = (items: Selection = selection) => {
    if (!compiled.ok || items.length !== 1 || items[0]?.kind !== "group") return;
    const groupId = items[0].id;
    const result = ungroup(compiled.doc, groupId, compiled.layout);
    if (!updateDocument(result.doc)) return;
    setSelection(result.selection);
    setContextMenu(null);
    const count = result.selection.length;
    setToast(count === 1 ? "Ungrouped selection" : `Ungrouped selection (${count} layers promoted)`);
  };

  const groupCurrentSelection = (items: Selection = selection) => {
    if (!compiled.ok || !canGroupSelection(compiled.doc, items)) return;
    const result = groupSelection(compiled.doc, items, compiled.layout);
    if (!result) {
      setToast("Those layers cannot be grouped together");
      return;
    }
    if (!updateDocument(result.doc)) return;
    setSelection([{ kind: "group", id: result.id }]);
    setToast("Grouped selection");
  };

  const deleteGroupAndContents = (items: Selection = selection) => {
    if (!compiled.ok || items.length !== 1 || items[0]?.kind !== "group") return;
    if (!mutateCurrent((doc) => deleteSelection(doc, items))) return;
    setSelection([]);
    setContextMenu(null);
    setToast("Deleted group and contents");
  };

  const toggleSelectedLocked = () => {
    if (!compiled.ok || selection.length !== 1) return;
    const item = selection[0]!;
    const view = compiled.doc.views[0];
    const place = item.kind === "annotation" ? view?.annotations?.[item.id] : view?.places[item.id];
    mutateCurrent((doc) => setLocked(doc, item.kind, item.id, !place?.locked));
  };

  const toggleSelectedVisible = () => {
    if (!compiled.ok || selection.length !== 1) return;
    const item = selection[0]!;
    const view = compiled.doc.views[0];
    const place = item.kind === "annotation" ? view?.annotations?.[item.id] : view?.places[item.id];
    mutateCurrent((doc) => setVisible(doc, item.kind, item.id, place?.visible === false));
  };

  const changeSelectedZIndex = (direction: "front" | "back") => {
    if (!compiled.ok || selection.length !== 1) return;
    const item = selection[0]!;
    mutateCurrent((doc) => (direction === "front" ? sendToFront(doc, item.id) : sendToBack(doc, item.id)));
  };

  const fileMenuItems: TopMenuItem[] = [
    { id: "new", label: "New diagram", shortcut: "⌘N / Ctrl+N", onSelect: handleNewTab },
    { id: "open", label: "Open .dgm", shortcut: "⌘O / Ctrl+O", onSelect: () => void openFromDisk() },
    {
      id: "recycle-bin",
      label: `Recycle bin${recentlyClosed.length ? ` (${recentlyClosed.length})` : ""}`,
      onSelect: () => setRecycleBinOpen(true),
    },
    { id: "file-divider-1", label: "", separator: true },
    { id: "save", label: "Save", shortcut: "⌘S / Ctrl+S", disabled: !currentSourceValid, onSelect: saveActive },
    {
      id: "save-as",
      label: "Save As…",
      shortcut: "⌘⇧S / Ctrl+Shift+S",
      disabled: !currentSourceValid,
      onSelect: openSaveAs,
    },
    {
      id: "export",
      label: "Export",
      submenu: [
        {
          id: "export-studio",
          label: "Export…",
          disabled: !currentSourceValid,
          onSelect: () => setExportDialogFormat("svg"),
        },
        {
          id: "export-png",
          label: "PNG image…",
          disabled: !currentSourceValid,
          onSelect: () => setExportDialogFormat("png"),
        },
        {
          id: "export-pdf",
          label: "PDF document…",
          disabled: !currentSourceValid,
          onSelect: () => setExportDialogFormat("pdf"),
        },
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
    { id: "command-select", label: "Select tool", section: "Tools", shortcut: "V", onSelect: () => setTool("select") },
    {
      id: "command-group",
      label: "Group selection",
      section: "Arrange",
      shortcut: "Cmd/Ctrl+G",
      disabled: !compiled.ok || !canGroupSelection(compiled.doc, selection),
      onSelect: groupCurrentSelection,
    },
    {
      id: "command-ungroup",
      label: "Ungroup selection",
      section: "Arrange",
      shortcut: "Cmd/Ctrl+Shift+G",
      disabled: !selection.some((item) => item.kind === "group"),
      onSelect: ungroupCurrentSelection,
    },
    {
      id: "command-select-all",
      label: "Select all",
      section: "Edit",
      shortcut: "Cmd/Ctrl+A",
      disabled: !compiled.ok,
      onSelect: () => {
        if (!compiled.ok) return;
        setSelection([
          ...compiled.doc.resources.map(({ id }) => ({ kind: "resource" as const, id })),
          ...compiled.doc.groups.map(({ id }) => ({ kind: "group" as const, id })),
          ...compiled.doc.edges.map(({ id }) => ({ kind: "edge" as const, id })),
          ...compiled.doc.annotations.map(({ id }) => ({ kind: "annotation" as const, id })),
        ]);
      },
    },
    { id: "command-new", label: "New diagram", section: "File", shortcut: "⌘N", onSelect: handleNewTab },
    { id: "command-open", label: "Open .dgm", section: "File", shortcut: "⌘O", onSelect: () => void openFromDisk() },
    {
      id: "command-save",
      label: "Save",
      section: "File",
      shortcut: "⌘S",
      disabled: !currentSourceValid,
      onSelect: saveActive,
    },
    {
      id: "command-save-as",
      label: "Save As",
      section: "File",
      shortcut: "⌘⇧S",
      disabled: !currentSourceValid,
      onSelect: openSaveAs,
    },
    { id: "command-duplicate-tab", label: "Duplicate tab", section: "Workspace", onSelect: duplicateActiveTab },
    {
      id: "command-close-tab",
      label: "Close tab",
      section: "Workspace",
      shortcut: "⌘W",
      disabled: isProtectedDefaultTab(tabs, BLANK_SOURCE, activeTab.id),
      onSelect: () => handleCloseTab(activeTab.id),
    },
    {
      id: "command-reopen-tab",
      label: "Reopen closed tab",
      section: "Workspace",
      disabled: recentlyClosed.length === 0,
      onSelect: reopenLastTab,
    },
    {
      id: "command-recycle-bin",
      label: `Open recycle bin${recentlyClosed.length ? ` (${recentlyClosed.length})` : ""}`,
      section: "Workspace",
      onSelect: () => setRecycleBinOpen(true),
    },
    { id: "command-examples", label: "Browse examples", section: "Help", onSelect: () => setExamplesOpen(true) },
    { id: "command-help", label: "Open help", section: "Help", onSelect: () => setHelpOpen(true) },
    { id: "command-undo", label: "Undo", section: "Edit", shortcut: "⌘Z", disabled: !canUndo, onSelect: undo },
    { id: "command-redo", label: "Redo", section: "Edit", shortcut: "⌘⇧Z", disabled: !canRedo, onSelect: redo },
    {
      id: "command-copy",
      label: "Copy selection",
      section: "Edit",
      shortcut: "⌘C",
      disabled: selection.length === 0,
      onSelect: () => void copySelection(),
    },
    {
      id: "command-cut",
      label: "Cut selection",
      section: "Edit",
      shortcut: "⌘X",
      disabled: selection.length === 0,
      onSelect: () => void cutSelection(),
    },
    {
      id: "command-paste",
      label: "Paste selection",
      section: "Edit",
      shortcut: "⌘V",
      disabled: !compiled.ok,
      onSelect: () => void pasteSelection(),
    },
    {
      id: "command-duplicate-selection",
      label: "Duplicate selection",
      section: "Edit",
      shortcut: "⌘D",
      disabled: selection.length === 0,
      onSelect: () => duplicateCurrentSelection(),
    },
    {
      id: "command-delete-selection",
      label: "Delete selection",
      section: "Edit",
      shortcut: "Delete",
      disabled: selection.length === 0,
      onSelect: () => removeCurrentSelection(),
    },
    {
      id: "command-align-left",
      label: "Align left",
      section: "Arrange",
      disabled: selection.length < 2 || !compiled.ok,
      onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "left")),
    },
    {
      id: "command-align-center",
      label: "Align center",
      section: "Arrange",
      disabled: selection.length < 2 || !compiled.ok,
      onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "center")),
    },
    {
      id: "command-align-right",
      label: "Align right",
      section: "Arrange",
      disabled: selection.length < 2 || !compiled.ok,
      onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "right")),
    },
    {
      id: "command-align-top",
      label: "Align top",
      section: "Arrange",
      disabled: selection.length < 2 || !compiled.ok,
      onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "top")),
    },
    {
      id: "command-align-middle",
      label: "Align middle",
      section: "Arrange",
      disabled: selection.length < 2 || !compiled.ok,
      onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "middle")),
    },
    {
      id: "command-align-bottom",
      label: "Align bottom",
      section: "Arrange",
      disabled: selection.length < 2 || !compiled.ok,
      onSelect: () => compiled.ok && mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout, "bottom")),
    },
    {
      id: "command-distribute-horizontal",
      label: "Distribute horizontally",
      section: "Arrange",
      disabled: selection.length < 3 || !compiled.ok,
      onSelect: () =>
        compiled.ok && mutateCurrent((doc) => distributeSelection(doc, selection, compiled.layout, "horizontal")),
    },
    {
      id: "command-distribute-vertical",
      label: "Distribute vertically",
      section: "Arrange",
      disabled: selection.length < 3 || !compiled.ok,
      onSelect: () =>
        compiled.ok && mutateCurrent((doc) => distributeSelection(doc, selection, compiled.layout, "vertical")),
    },
    {
      id: "command-bring-front",
      label: "Bring to front",
      section: "Arrange",
      disabled: selection.length !== 1 || !compiled.ok,
      onSelect: () => changeSelectedZIndex("front"),
    },
    {
      id: "command-send-back",
      label: "Send to back",
      section: "Arrange",
      disabled: selection.length !== 1 || !compiled.ok,
      onSelect: () => changeSelectedZIndex("back"),
    },
    {
      id: "command-toggle-lock",
      label: "Toggle lock",
      section: "Arrange",
      disabled: selection.length !== 1 || !compiled.ok,
      onSelect: toggleSelectedLocked,
    },
    {
      id: "command-toggle-visibility",
      label: "Toggle visibility",
      section: "Arrange",
      disabled: selection.length !== 1 || !compiled.ok,
      onSelect: toggleSelectedVisible,
    },
    {
      id: "command-auto-fix",
      label: "Auto-fix diagram",
      section: "View",
      disabled: documentCommands.autoFixing,
      onSelect: autoFix,
    },
    { id: "command-fit", label: "Fit to screen", section: "View", onSelect: () => fitRef.current?.() },
    {
      id: "command-zoom-in",
      label: "Zoom in",
      section: "View",
      onSelect: () => updateViewport({ ...viewport, zoom: clampZoom(viewport.zoom + 0.1) }),
    },
    {
      id: "command-zoom-out",
      label: "Zoom out",
      section: "View",
      onSelect: () => updateViewport({ ...viewport, zoom: clampZoom(viewport.zoom - 0.1) }),
    },
    {
      id: "command-reset-zoom",
      label: "Reset zoom",
      section: "View",
      onSelect: () => updateViewport({ ...viewport, zoom: 1 }),
    },
    {
      id: "command-grid",
      label: snapToGrid ? "Disable snap to grid" : "Enable snap to grid",
      section: "View",
      onSelect: () => setSnapToGrid((current) => !current),
    },
    { id: "command-source", label: "Open source editor", section: "Tools", onSelect: () => setTool("code") },
    { id: "command-layers", label: "Open layers", section: "Tools", onSelect: () => setTool("layers") },
    { id: "command-resources", label: "Browse resources", section: "Tools", onSelect: () => setTool("resources") },
    { id: "command-text", label: "Add text", section: "Tools", shortcut: "T", onSelect: openTextComposer },
  ];
  useStudioShortcuts({
    ready: workspaceReady && !operation?.blocking,
    commands,
    onOpenPalette: () => setCommandPaletteOpen(true),
    onEscape: () => {
      setPendingPort(null);
      setSelection([]);
      setContextMenu(null);
    },
    onNudge: (dx, dy) => {
      if (selection.length) mutateCurrent((doc) => nudgeSelection(doc, selection, dx, dy, { snapToGrid }));
    },
  });
  const requestedCloseTab = closeRequest ? tabs.find((tab) => tab.id === closeRequest) : undefined;
  const tabContextTarget = tabContextMenu ? tabs.find((tab) => tab.id === tabContextMenu.tabId) : undefined;
  const isProtectedBlankTab = (tab: WorkspaceTab | undefined) =>
    Boolean(tab && isProtectedDefaultTab(tabs, BLANK_SOURCE, tab.id));
  const tabContextMenuItems: ContextMenuItem[] = tabContextTarget
    ? [
        {
          id: "duplicate-tab",
          label: "Duplicate tab",
          onSelect: () => duplicateTabWithFeedback(tabContextTarget.id),
        },
        ...(!isProtectedBlankTab(tabContextTarget)
          ? [
              {
                id: "close-tab",
                label: "Close tab",
                shortcut: "⌘W / Ctrl+W",
                danger: true,
                onSelect: () => handleCloseTab(tabContextTarget.id),
              },
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
            ]
          : []),
      ]
    : [];

  return (
    <div className="app" aria-busy={!workspaceReady || Boolean(operation)}>
      <section className="canvas-pane">
        <CanvasStage
          id="diagram-canvas"
          viewport={viewport}
          onViewportChange={updateViewport}
          contentSize={
            displayCanvas
              ? {
                  x: displayCanvas.x,
                  y: displayCanvas.y,
                  width: displayCanvas.w,
                  height: displayCanvas.h,
                }
              : undefined
          }
          defaultFrameKey={defaultFrameKey}
          onFitRequest={(fit) => {
            fitRef.current = fit;
          }}
          onCatalogDragOver={handleCatalogDragOver}
          onCatalogDrop={handleCatalogDrop}
          onContextMenu={(clientX, clientY, point) => {
            const canvasPoint =
              Number.isFinite(point.x) && Number.isFinite(point.y)
                ? snapPoint(point, snapToGrid)
                : snapPoint(insertionPoint(compiled.ok ? compiled.layout : displayCompiled!.layout), snapToGrid);
            setContextMenu({
              x: clientX,
              y: clientY,
              selection,
              canvasPoint,
            });
          }}
          marqueeEnabled={compiled.ok && interactionTool === "select"}
          onMarqueePreview={setStageMarquee}
          onMarqueeCommit={selectMarquee}
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
              {compiled.ok && (
                <InteractionOverlay
                  key={activeTabId}
                  doc={compiled.doc}
                  layout={compiled.layout}
                  tool={interactionTool}
                  zoom={viewport.zoom}
                  snapToGrid={snapToGrid}
                  selection={selection}
                  externalMarquee={stageMarquee}
                  pendingPort={pendingPort}
                  onSelect={selectItem}
                  onEditText={requestTextEdit}
                  onChoosePort={choosePort}
                  onClearPendingPort={() => setPendingPort(null)}
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
                  onGestureBegin={() => beginTransaction(activeTabId)}
                  onGestureEnd={() => endTransaction(activeTabId)}
                  onGestureCancel={() => cancelTransaction(activeTabId)}
                  onMove={(kind, id, _x, _y, dx, dy) => {
                    return previewMutate((doc) => {
                      const item = { kind, id } as SelectionItem;
                      const active = selection.some((candidate) => candidate.kind === kind && candidate.id === id)
                        ? selection
                        : [item];
                      return moveSelection(doc, active, dx, dy, compiled.layout);
                    });
                  }}
                  onResize={(kind, id, bounds, unlockAspect) => {
                    return previewMutate((doc) =>
                      kind === "group"
                        ? setGroupBounds(doc, id, bounds)
                        : setSize(doc, id, bounds.w, bounds.h, { unlockAspect }),
                    );
                  }}
                  onRoute={(edgeId, points) => previewMutate((doc) => setRoute(doc, edgeId, points))}
                  onBadgeMove={(edgeId, t, side) => previewMutate((doc) => setEdgeBadgePosition(doc, edgeId, t, side))}
                  onLabelMove={(edgeId, t, side) => previewMutate((doc) => setEdgeLabelPosition(doc, edgeId, t, side))}
                  onContextMenu={(clientX, clientY, item) => {
                    const itemIsSelected = Boolean(
                      item && selection.some((candidate) => candidate.kind === item.kind && candidate.id === item.id),
                    );
                    const nextSelection = item ? (itemIsSelected ? selection : [item]) : selection;
                    if (item && !itemIsSelected) setSelection([item]);
                    setContextMenu({
                      x: clientX,
                      y: clientY,
                      selection: nextSelection,
                    });
                  }}
                />
              )}
            </div>
          ) : (
            <div className="empty-canvas">No valid diagram to preview yet.</div>
          )}
        </CanvasStage>
        {!compiledFromCache.ok && displayCompiled && (
          <div className="source-error-banner" role="alert">
            <strong>
              {parsedDoc
                ? "Diagram error — repair the source to save or export."
                : "Source error — showing the last valid diagram."}
            </strong>
            <span>{issues[0]?.message}</span>
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
                onPaste={(event) =>
                  rejectOversizedPaste(event, DIAGRAM_LIMITS.titleCharacters, () =>
                    setToast(`Diagram names are limited to ${DIAGRAM_LIMITS.titleCharacters} characters`),
                  )
                }
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
          </div>
          <div className="topbar-center">
            <button
              type="button"
              className="auto-fix-button"
              aria-label="Auto-fix"
              aria-busy={documentCommands.autoFixing}
              disabled={documentCommands.autoFixing}
              title="Repair overlaps and crossings in the current diagram. Undo restores the previous layout."
              onClick={autoFix}
            >
              {documentCommands.autoFixing ? (
                <span className="loading-spinner is-small" aria-hidden="true" />
              ) : (
                <IconMagicWand />
              )}
              <span>{documentCommands.autoFixing ? "Fixing…" : "Auto-fix"}</span>
            </button>
            <button
              type="button"
              className={`snap-toggle${snapToGrid ? " is-active" : ""}`}
              aria-label="Snap to grid"
              aria-pressed={snapToGrid}
              title={`Snap moved objects to the ${GRID_SIZE}px grid`}
              onClick={() => setSnapToGrid((current) => !current)}
            >
              <IconGrid />
              <span>Snap to grid</span>
            </button>
          </div>
          <div className="topbar-right">
            <EntityNavigator
              entities={navigableEntities}
              selected={selection}
              onSelect={selectNavigatedEntity}
              onDelete={(item) => removeCurrentSelection([item])}
              onFocusCanvas={focusCanvas}
            />
            <IssueJournal issues={journalIssues} onIssueSelect={handleIssueSelect} />
            {persistenceWarning && (
              <button
                type="button"
                className="text-button"
                onClick={exportCurrentSource}
                title="Keep a local copy of this tab, including unfinished source"
              >
                Download source
              </button>
            )}
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
              {currentSourceValid ? (
                <ExportMenu selectionCount={selection.length} onOpenExport={setExportDialogFormat} />
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
              <img className="brand-logo" src="./logo_dumbdiagrams.png" alt="" width="128" height="77" />
              <span className="dd-wordmark" aria-hidden="true">
                dumb<span className="dd-wordmark__light">diagrams</span>
                <span className="dd-wordmark__dot">.</span>
              </span>
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
            canCloseTab={(tab) => !isProtectedDefaultTab(tabs, BLANK_SOURCE, tab.id)}
          />
          <nav className="studio-tabbar-actions" aria-label="Studio menu">
            <ThemeControl />
            <TopMenu label="Help" Icon={IconHelp} items={helpMenuItems} />
          </nav>
        </div>

        <ToolDock
          active={tool}
          onChange={(next) => {
            clearLeftDrawerClose();
            if (next === "note") {
              openNoteComposer();
              return;
            }
            if (next === "text") {
              openTextComposer();
              return;
            }
            if (isLeftDrawerTool(tool) && next === "select") {
              beginLeftDrawerClose(tool);
              return;
            }
            setTool(next);
            if (next !== "connector") setPendingPort(null);
          }}
        />

        {(tool === "note" || closingLeftDrawer === "note") && (
          <FloatingPanel
            className="drawer-sheet"
            title="Choose note style"
            subtitle="Pick a format before placing it on the canvas"
            onClose={() => requestLeftDrawerClose("note")}
            onCloseAnimationEnd={() => finishLeftDrawerClose("note")}
            closing={closingLeftDrawer === "note"}
            width={LEFT_DRAWER_WIDTH}
          >
            <NoteComposer
              style={noteComposerStyle}
              onStyleChange={setNoteComposerStyle}
              onCreate={() => createNote(noteComposerStyle)}
            />
          </FloatingPanel>
        )}

        {(tool === "text" || closingLeftDrawer === "text") && (
          <FloatingPanel
            className="drawer-sheet text-composer-sheet"
            title="Add text"
            subtitle="Place editable text on the canvas"
            onClose={() => requestLeftDrawerClose("text")}
            onCloseAnimationEnd={() => finishLeftDrawerClose("text")}
            closing={closingLeftDrawer === "text"}
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

        {(tool === "resources" || closingLeftDrawer === "resources") && (
          <FloatingPanel
            className="drawer-sheet asset-sheet"
            title="Resources"
            subtitle="Browse services by provider and category"
            onClose={() => requestLeftDrawerClose("resources")}
            onCloseAnimationEnd={() => finishLeftDrawerClose("resources")}
            closing={closingLeftDrawer === "resources"}
            width={LEFT_DRAWER_WIDTH}
          >
            <AssetBrowser
              mode="resources"
              onAddService={addCatalogResource}
              onAddGroup={() => {}}
              onImportSvg={async (file) => {
                if (!compiled.ok) return;
                const tabId = activeTabId;
                const originalSource = sourceRef.current;
                const parent =
                  primarySelection(selection)?.kind === "group" ? primarySelection(selection)!.id : undefined;
                const at = snapPoint(
                  parent
                    ? insertionPoint(compiled.layout, parent)
                    : leftStagingInsertionPoint(compiled.doc, compiled.layout, 240),
                  snapToGrid,
                );
                const result = await importSvgFile(file, compiled.doc, parent, at);
                if (activeTabRef.current !== tabId || sourceRef.current !== originalSource) return;
                if (result.isErr()) {
                  if (result.error.code === "unexpected") console.error("SVG import failed", result.error.cause);
                  setToast(result.error.message);
                  return;
                }
                if (!updateDocument(result.value.doc)) return;
                setSelection([{ kind: "resource", id: result.value.id }]);
                setToast(`Imported ${file.name}`);
              }}
            />
          </FloatingPanel>
        )}

        {(tool === "groups" || closingLeftDrawer === "groups") && (
          <FloatingPanel
            className="drawer-sheet asset-sheet"
            title="Boundaries"
            subtitle="Logical and infrastructure scopes by provider"
            onClose={() => requestLeftDrawerClose("groups")}
            onCloseAnimationEnd={() => finishLeftDrawerClose("groups")}
            closing={closingLeftDrawer === "groups"}
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

        {(tool === "connector" || closingLeftDrawer === "connector") && (
          <FloatingPanel
            className="drawer-sheet"
            title="Connector"
            subtitle="Pick ports on two icons"
            onClose={() => requestLeftDrawerClose("connector")}
            onCloseAnimationEnd={() => finishLeftDrawerClose("connector")}
            closing={closingLeftDrawer === "connector"}
            width={LEFT_DRAWER_WIDTH}
          >
            <ConnectorDrawer pendingPort={pendingPort} />
          </FloatingPanel>
        )}

        {compiled.ok && selection.some((item) => item.kind === "edge") && (
          <FloatingPanel
            className="drawer-sheet edge-sheet"
            title="Connector"
            subtitle="Meaning, appearance, and routing"
            onClose={() => setSelection((current) => current.filter((item) => item.kind !== "edge"))}
            width={360}
          >
            {(() => {
              const edgeItem = selection.find((item) => item.kind === "edge");
              const edge = edgeItem ? compiled.doc.edges.find((candidate) => candidate.id === edgeItem.id) : undefined;
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
                    mutateCurrent((doc) => updateEdgePreservingLayout(doc, edge.id, patch, compiled.layout))
                  }
                  onUpdateColor={(color) => mutateCurrent((doc) => updateEdge(doc, edge.id, { color }))}
                  onUpdateStep={(step) => mutateCurrent((doc) => updateEdge(doc, edge.id, { step }))}
                  onPinRoute={() => {
                    const edgeGeom = compiled.layout.edges.find((candidate) => candidate.id === edge.id);
                    if (!edgeGeom) return;
                    const routePoints = edgeGeom.points.map((point) => snapPoint(point, snapToGrid));
                    mutateCurrent((doc) => setRoute(doc, edge.id, normalizeOrthogonalRoute(routePoints)));
                  }}
                  onAutoRoute={() => mutateCurrent((doc) => clearRoute(doc, edge.id))}
                  onSwapDirection={() => mutateCurrent((doc) => swapEdgeDirection(doc, edge.id))}
                  onDelete={() => {
                    if (!mutateCurrent((doc) => deleteSelection(doc, [edgeItem]))) return;
                    setSelection((current) => current.filter((item) => item.kind !== "edge"));
                  }}
                />
              );
            })()}
          </FloatingPanel>
        )}

        {(tool === "code" || closingLeftDrawer === "code") && (
          <FloatingPanel
            className="drawer-sheet source-sheet"
            title="Source"
            subtitle="Valid edits sync to the canvas"
            onClose={() => requestLeftDrawerClose("code")}
            onCloseAnimationEnd={() => finishLeftDrawerClose("code")}
            closing={closingLeftDrawer === "code"}
            width={LEFT_DRAWER_WIDTH}
          >
            <Suspense
              fallback={
                <div className="source-drawer">
                  <div className="source-editor-shell source-drawer-loading">Loading source editor…</div>
                </div>
              }
            >
              <SourceDrawer
                source={source}
                issues={issues}
                onChange={onSourceChange}
                onCommit={onSourceCommit}
                onCopy={() => void copySource()}
                canFormat={currentSourceValid}
                onFormat={() => {
                  const parsed = parseDgmResult(source);
                  if (parsed.isErr()) setToast("Cannot format invalid source");
                  else if (updateDocument(parsed.value)) setToast("Formatted source");
                }}
                onReset={activeTab.origin === "example" ? () => setResetExampleOpen(true) : undefined}
              />
            </Suspense>
          </FloatingPanel>
        )}

        {compiled.ok && (tool === "layers" || closingLeftDrawer === "layers") && (
          <FloatingPanel
            className="drawer-sheet layers-sheet"
            title="Layers"
            subtitle="Hierarchy, visibility, and lock"
            onClose={() => requestLeftDrawerClose("layers")}
            onCloseAnimationEnd={() => finishLeftDrawerClose("layers")}
            closing={closingLeftDrawer === "layers"}
            width={LEFT_DRAWER_WIDTH}
          >
            <LayersPanel
              doc={compiled.doc}
              selection={selection}
              query={layersQuery}
              onQuery={setLayersQuery}
              onSelect={selectItem}
              canGroup={canGroupSelection(compiled.doc, selection)}
              canUngroup={selection.length === 1 && selection[0]?.kind === "group"}
              onGroup={() => groupCurrentSelection()}
              onUngroup={() => ungroupCurrentSelection()}
              onToggleVisible={(item) => {
                mutateCurrent((doc) => {
                  const view = doc.views[0]!;
                  const place = item.kind === "annotation" ? view.annotations?.[item.id] : view.places[item.id];
                  return setVisible(doc, item.kind, item.id, place?.visible === false);
                });
              }}
              onToggleLocked={(item) => {
                mutateCurrent((doc) => {
                  const view = doc.views[0]!;
                  const place = item.kind === "annotation" ? view.annotations?.[item.id] : view.places[item.id];
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
              const normalized =
                item.kind === "annotation" ? normalizeMultilineText(label) : normalizeSingleLineText(label);
              mutateCurrent((doc) => {
                if (item.kind === "resource") return renameResource(doc, item.id, normalized);
                if (item.kind === "group") return renameGroup(doc, item.id, normalized);
                if (item.kind === "edge") return renameEdge(doc, item.id, normalized);
                if (item.kind === "annotation") return updateAnnotationText(doc, item.id, normalized);
                return doc;
              });
            }}
            onLimitError={setToast}
            onAlign={(axis) => mutateCurrent((doc) => alignSelection(doc, selection, compiled.layout!, axis))}
            onDistribute={(axis) => mutateCurrent((doc) => distributeSelection(doc, selection, compiled.layout!, axis))}
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
              mutateCurrent((doc) => updateEdgePreservingLayout(doc, edge.id, { style, kind }, compiled.layout));
            }}
            onPinRoute={() => {
              const edgeItem = selection.find((item) => item.kind === "edge");
              const edge = edgeItem
                ? compiled.layout.edges.find((candidate) => candidate.id === edgeItem.id)
                : undefined;
              if (edge) {
                mutateCurrent((doc) => setRoute(doc, edge.id, normalizeOrthogonalRoute(edge.points)));
              }
            }}
            onAutoRoute={() => {
              const edge = selection.find((item) => item.kind === "edge");
              if (!edge) return;
              mutateCurrent((doc) => clearRoute(doc, edge.id));
            }}
            onDelete={() => {
              removeCurrentSelection(selection);
            }}
            onClose={() => setSelection([])}
          />
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
          <span className="privacy-footer-divider" aria-hidden="true">
            |
          </span>
          <span className="privacy-footer-message">
            <IconLock />
            <span>Your data stays on your device · nothing is uploaded.</span>
          </span>
        </footer>

        {toast && (
          <div key={`${toast}-${toastNonce}`} className="toast" role="status">
            {toast}
          </div>
        )}
        {operation && !operation.blocking && (
          <div className="operation-status" role="status" aria-live="polite">
            <span className="loading-spinner is-small" aria-hidden="true" />
            <span>{operation.label}</span>
            {operation.total !== undefined && operation.completed !== undefined && (
              <>
                <progress value={operation.completed} max={Math.max(1, operation.total)} aria-label={operation.label} />
                <span className="mono">
                  {operation.completed}/{operation.total}
                </span>
              </>
            )}
          </div>
        )}
        {operation?.blocking && (
          <div className="workspace-loading operation-loading" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <strong>{operation.label}</strong>
            <span>Preparing the canvas and diagram layout</span>
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
          <Suspense
            fallback={
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
            }
          >
            <ExamplesModal
              open
              onClose={() => setExamplesOpen(false)}
              onOpen={openExampleInTab}
              openingExampleId={openingExampleId}
            />
          </Suspense>
        )}

        <HelpModal
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          onExamples={() => {
            setHelpOpen(false);
            setExamplesOpen(true);
          }}
        />

        <CommandPalette open={commandPaletteOpen} commands={commands} onClose={() => setCommandPaletteOpen(false)} />

        {currentCompilation && (
          <ExportDialog
            open={exportDialogFormat !== null}
            initialFormat={exportDialogFormat ?? "svg"}
            title={documentNameForDisplay(currentCompilation.doc)}
            source={source}
            doc={currentCompilation.doc}
            layout={currentCompilation.layout}
            selection={selection}
            getPortableSvg={() => renderPortableSvg(currentCompilation.doc, currentCompilation.layout)}
            onClose={() => setExportDialogFormat(null)}
            onToast={setToast}
          />
        )}

        <Modal
          open={saveAsOpen}
          title="Save diagram as"
          subtitle="Choose the filename for the new .dgm source."
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
              onPaste={(event) =>
                rejectOversizedPaste(event, DIAGRAM_LIMITS.filenameCharacters, () =>
                  setToast(`Filenames are limited to ${DIAGRAM_LIMITS.filenameCharacters} characters`),
                )
              }
              placeholder="diagram.dgm"
              aria-describedby="save-as-limit"
            />
            <span id="save-as-limit" className="input-limit" aria-live="polite">
              {characterLength(saveAsDraft)} / {DIAGRAM_LIMITS.filenameCharacters}
            </span>
            <div className="modal-actions">
              <button type="button" className="text-button" onClick={() => setSaveAsOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={!saveAsDraft.trim()}>
                Save .dgm
              </button>
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
              <button type="button" className="text-button" onClick={() => setCloseRequest(null)}>
                Cancel
              </button>
              <button type="button" className="danger-button" onClick={closeRequestedTab}>
                Discard
              </button>
              <button type="button" className="primary-button" onClick={saveAndCloseRequestedTab}>
                Save and close
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={Boolean(fileConflictRequest)}
          title="File changed on disk"
          subtitle={fileConflictRequest?.filename}
          onClose={() => setFileConflictRequest(null)}
          className="confirm-dialog"
          width={500}
        >
          <div className="confirm-modal">
            <p>
              Another editor changed or replaced this file after Studio opened it. Choose whether to keep the external
              source or replace it with your Studio edits.
            </p>
            <div className="modal-actions modal-actions-spread">
              <button type="button" className="text-button" onClick={() => setFileConflictRequest(null)}>
                Cancel
              </button>
              <button type="button" className="text-button" onClick={reloadConflictingFile}>
                Reload from disk
              </button>
              <button type="button" className="danger-button" onClick={() => void overwriteConflictingFile()}>
                Overwrite anyway
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={Boolean(bulkCloseRequest)}
          title={bulkCloseRequest?.kind === "right" ? "Close tabs to the right?" : "Close all tabs?"}
          subtitle={
            bulkCloseRequest
              ? `${bulkCloseRequest.tabCount} tab${bulkCloseRequest.tabCount === 1 ? "" : "s"} will be closed`
              : undefined
          }
          onClose={() => setBulkCloseRequest(null)}
          className="confirm-dialog"
          width={460}
        >
          <div className="confirm-modal">
            {bulkCloseRequest?.dirtyCount ? (
              <p>
                {bulkCloseRequest.dirtyCount} unsaved diagram{bulkCloseRequest.dirtyCount === 1 ? "" : "s"} will be
                discarded. Closed diagrams remain in the recycle bin for recovery.
              </p>
            ) : (
              <p>These diagrams have no unsaved changes and will be closed.</p>
            )}
            <p>The recycle bin keeps the latest 10 closed diagrams.</p>
            <div className="modal-actions modal-actions-spread">
              <button type="button" className="text-button" onClick={() => setBulkCloseRequest(null)}>
                Cancel
              </button>
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
            <p>
              Your current source will be replaced with the original example from the repository. Any unsaved edits will
              be discarded.
            </p>
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
            items={buildContextMenuItems(contextMenu.selection, compiled.doc, {
              onCopy: () => void copySelection(contextMenu.selection),
              onCut: () => void cutSelection(contextMenu.selection),
              onPaste: () => void pasteSelection(contextMenu.canvasPoint),
              onDuplicate: () => duplicateCurrentSelection(contextMenu.selection),
              onDelete: () => removeCurrentSelection(contextMenu.selection),
              onGroup: () => groupCurrentSelection(contextMenu.selection),
              onDeleteGroup: () => removeCurrentSelection(contextMenu.selection),
              onFitGroup: () => fitCurrentGroup(contextMenu.selection),
              onUngroup: () => ungroupCurrentSelection(contextMenu.selection),
              onDeleteGroupAndContents: () => deleteGroupAndContents(contextMenu.selection),
              onMutate: (change) => mutateCurrent(change),
            })}
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
          Starting at <strong>{pendingPort.nodeId}</strong> · {pendingPort.side.toUpperCase()}{" "}
          {Math.round(pendingPort.offset * 100)}%. Pick a target port.
        </>
      ) : (
        <>Select a source port, then a target port on another icon.</>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
