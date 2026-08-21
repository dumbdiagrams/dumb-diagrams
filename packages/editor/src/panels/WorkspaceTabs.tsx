import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { WorkspaceTab } from "../state/workspace";
import { IconClose, IconPlus } from "../ui/icons";

export function WorkspaceTabs({
  tabs,
  activeTabId,
  closingTabId,
  tabLimit,
  getLabel,
  onSelect,
  onClose,
  onCloseAnimationEnd,
  onNew,
  onReorder,
  onContextMenu,
}: {
  tabs: WorkspaceTab[];
  activeTabId: string;
  closingTabId: string | null;
  tabLimit: number;
  getLabel: (tab: WorkspaceTab) => string;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseAnimationEnd: (tabId: string) => void;
  onNew: () => void;
  onReorder: (tabId: string, targetTabId: string) => void;
  onContextMenu: (tabId: string, x: number, y: number) => void;
}) {
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const knownTabIdsRef = useRef(new Set(tabs.map((tab) => tab.id)));
  const atTabLimit = tabs.length >= tabLimit;
  const newTabLabel = atTabLimit
    ? `Maximum reached: ${tabLimit} open diagrams. Close a tab to create another.`
    : "New diagram";

  useEffect(() => {
    const tab = tabRefs.current.get(activeTabId);
    if (!tab) return;
    // A smooth scroll here competes with the tab's own layout animation and is
    // especially visible as a hitch on high-refresh-rate displays.
    tab.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  useLayoutEffect(() => {
    const knownTabIds = knownTabIdsRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const tab of tabs) {
      if (knownTabIds.has(tab.id)) continue;
      const element = tabRefs.current.get(tab.id);
      if (!element || reducedMotion) continue;
      const targetWidth = element.getBoundingClientRect().width;
      element.animate([
        {
          width: `${targetWidth}px`,
          minWidth: "0px",
          maxWidth: `${targetWidth}px`,
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: "0px",
          opacity: 0.45,
        },
        {
          width: `${targetWidth}px`,
          minWidth: "0px",
          maxWidth: `${targetWidth}px`,
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: `${targetWidth}px`,
          opacity: 1,
        },
      ], {
        duration: 220,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }

    knownTabIdsRef.current = new Set(tabs.map((tab) => tab.id));
  }, [tabs]);

  return (
    <div className="workspace-tabs" role="tablist" aria-label="Open diagrams">
      <div className="workspace-tab-scroll">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const closing = tab.id === closingTabId;
          const label = getLabel(tab);
          return (
            <div
              key={tab.id}
              ref={(element) => {
                if (element) {
                  tabRefs.current.set(tab.id, element);
                  if (closing && !element.style.getPropertyValue("--workspace-tab-current-width")) {
                    element.style.setProperty("--workspace-tab-current-width", `${element.getBoundingClientRect().width}px`);
                  }
                } else tabRefs.current.delete(tab.id);
              }}
              className={`workspace-tab${active ? " is-active" : ""}${closing ? " is-closing" : ""}${draggedTabId === tab.id ? " is-dragging" : ""}${dropTargetId === tab.id ? " is-drop-target" : ""}`}
              draggable={!closing}
              onDragStart={(event) => {
                if (closing) return;
                setDraggedTabId(tab.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", tab.id);
              }}
              onDragOver={(event) => {
                if (closing) return;
                event.preventDefault();
                if (draggedTabId && draggedTabId !== tab.id) {
                  event.dataTransfer.dropEffect = "move";
                  setDropTargetId(tab.id);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDropTargetId(null);
                }
              }}
              onDrop={(event) => {
                if (closing) return;
                event.preventDefault();
                const sourceId = event.dataTransfer.getData("text/plain") || draggedTabId;
                if (sourceId && sourceId !== tab.id) onReorder(sourceId, tab.id);
                setDraggedTabId(null);
                setDropTargetId(null);
              }}
              onDragEnd={() => {
                setDraggedTabId(null);
                setDropTargetId(null);
              }}
              onContextMenu={(event) => {
                if (closing) return;
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(tab.id, event.clientX, event.clientY);
              }}
              onAnimationEnd={(event) => {
                if (closing && event.animationName === "workspace-tab-close") {
                  onCloseAnimationEnd(tab.id);
                }
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="diagram-canvas"
                className="workspace-tab-select"
                onClick={() => {
                  if (!closing) onSelect(tab.id);
                }}
                title={tab.filename ?? label}
              >
                {tab.source !== tab.savedSource && <span className="workspace-tab-dirty" aria-label="Unsaved changes" />}
                <span className="workspace-tab-label">{label}</span>
                {tab.filename && <span className="workspace-tab-filename">{tab.filename}</span>}
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="workspace-tab-close"
                  aria-label={`Close ${label}`}
                  title={`Close ${label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab.id);
                  }}
                >
                  <IconClose />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <span className={`workspace-tab-new-control${atTabLimit ? " is-at-limit" : ""}`}>
        <button
          type="button"
          className="workspace-tab-new"
          onClick={onNew}
          title={newTabLabel}
          aria-label={newTabLabel}
          aria-describedby={atTabLimit ? "workspace-tab-limit-tooltip" : undefined}
          disabled={atTabLimit}
        >
          <IconPlus />
        </button>
        {atTabLimit && (
          <span id="workspace-tab-limit-tooltip" className="workspace-tab-new-tooltip" role="tooltip">
            <strong>Maximum reached</strong>
            <span>{tabLimit} open diagrams. Close a tab to create another.</span>
          </span>
        )}
      </span>
    </div>
  );
}
