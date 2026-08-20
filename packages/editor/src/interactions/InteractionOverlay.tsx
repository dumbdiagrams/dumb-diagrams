import type {
  DiagramDocument,
  EdgeKind,
  EdgeStyle,
  LayoutResult,
  Point,
  Side,
} from "@dumb-diagrams/core";
import { getDefaultView } from "@dumb-diagrams/core";
import { routeEdgePreview } from "@dumb-diagrams/route";
import { useMemo, useState } from "react";

import {
  isSelected,
  type Selection,
  type SelectionItem,
} from "../editor-model";

type Mode = "auto" | "manual";
type Tool = "select" | "connector" | "resources" | "groups" | "code" | "layers" | "note";

export function InteractionOverlay({
  doc,
  layout,
  mode,
  tool,
  zoom,
  selection,
  pendingPort,
  ghostRoute,
  onSelect,
  onMarquee,
  onBackgroundClick,
  onChoosePort,
  onReconnect,
  onGestureBegin,
  onGestureEnd,
  onMove,
  onResize,
  onRoute,
  onContextMenu,
}: {
  doc: DiagramDocument;
  layout: LayoutResult;
  mode: Mode;
  tool: Tool;
  zoom: number;
  selection: Selection;
  pendingPort: { nodeId: string; side: Side } | null;
  ghostRoute: Point[] | null;
  onSelect: (item: SelectionItem, additive: boolean) => void;
  onMarquee: (rect: { x: number; y: number; w: number; h: number }) => void;
  onBackgroundClick: () => void;
  onChoosePort: (nodeId: string, side: Side) => void;
  onReconnect: (
    edgeId: string,
    endpoint: "source" | "target",
    nodeId: string,
    side: Side,
  ) => void;
  onGestureBegin: () => void;
  onGestureEnd: () => void;
  onMove: (
    kind: "resource" | "group" | "annotation",
    id: string,
    x: number,
    y: number,
    dx: number,
    dy: number,
  ) => void;
  onResize: (
    kind: "resource" | "group" | "annotation",
    id: string,
    w: number,
    h: number,
    unlockAspect?: boolean,
  ) => void;
  onRoute: (edgeId: string, points: Point[]) => void;
  onContextMenu: (
    clientX: number,
    clientY: number,
    item: SelectionItem,
  ) => void;
}) {
  const view = getDefaultView(doc);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  const groups = useMemo(
    () => [...layout.groups].sort((a, b) => {
      const az = view.places[a.id]?.zIndex ?? 0;
      const bz = view.places[b.id]?.zIndex ?? 0;
      return az - bz || b.bounds.w * b.bounds.h - a.bounds.w * a.bounds.h;
    }),
    [layout.groups, view.places],
  );
  const edges = useMemo(
    () => [...layout.edges].sort((a, b) => (view.places[a.id]?.zIndex ?? 0) - (view.places[b.id]?.zIndex ?? 0)),
    [layout.edges, view.places],
  );
  const nodes = useMemo(
    () => [...layout.nodes].sort((a, b) => (view.places[a.id]?.zIndex ?? 0) - (view.places[b.id]?.zIndex ?? 0)),
    [layout.nodes, view.places],
  );
  const showAllPorts = tool === "connector";

  const selectedEdge = selection.find((item) => item.kind === "edge");
  const edgeGeom = selectedEdge
    ? layout.edges.find((edge) => edge.id === selectedEdge.id)
    : undefined;

  const predicted =
    ghostRoute ??
    (selectedEdge
      ? routeEdgePreview(doc, layout, selectedEdge.id) ?? undefined
      : undefined);

  return (
    <svg
      className="interaction-overlay"
      data-testid="canvas-interaction-overlay"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      aria-label="Diagram editing layer"
      onPointerDown={(event) => {
        if (tool !== "select" || event.button !== 0) return;
        if ((event.target as Element).closest("[data-interactive]")) return;
        const svgRect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
        const toSvg = (clientX: number, clientY: number): Point => ({
          x: (clientX - svgRect.left) / zoom,
          y: (clientY - svgRect.top) / zoom,
        });
        const start = toSvg(event.clientX, event.clientY);
        const move = (next: PointerEvent) => {
          const current = toSvg(next.clientX, next.clientY);
          setMarquee(rectFromPoints(start, current));
        };
        const up = (next: PointerEvent) => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          const current = toSvg(next.clientX, next.clientY);
          const rect = rectFromPoints(start, current);
          setMarquee(null);
          if (rect.w > 4 || rect.h > 4) onMarquee(rect);
          else onBackgroundClick();
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      {groups.map((group) => {
        const place = view.places[group.id];
        if (!isEntityVisible(doc, view, group.id)) return null;
        return (
          <rect
            key={group.id}
            data-interactive
            data-entity-kind="group"
            data-entity-id={group.id}
            aria-selected={isSelected(selection, "group", group.id)}
            aria-label={`Group ${group.label}`}
            className={`hit-group ${isSelected(selection, "group", group.id) ? "is-selected" : ""}`}
            x={group.bounds.x}
            y={group.bounds.y}
            width={group.bounds.w}
            height={group.bounds.h}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect({ kind: "group", id: group.id }, event.shiftKey);
              if (tool === "select" && !place?.locked) {
                const origin = placeOrigin(view.places[group.id], group.bounds);
                beginMove(
                  event,
                  zoom,
                  origin,
                  (x, y, dx, dy) => onMove("group", group.id, x, y, dx, dy),
                  onGestureBegin,
                  onGestureEnd,
                );
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect({ kind: "group", id: group.id }, false);
              onContextMenu(event.clientX, event.clientY, { kind: "group", id: group.id });
            }}
          />
        );
      })}

      {edges.map((edge) => {
        const edgePlace = view.places[edge.id];
        if (edgePlace?.visible === false || !isEntityVisible(doc, view, edge.source) || !isEntityVisible(doc, view, edge.target)) return null;
        return <polyline
          key={edge.id}
          data-interactive
          data-entity-kind="edge"
          data-entity-id={edge.id}
          data-edge-id={edge.id}
          aria-selected={isSelected(selection, "edge", edge.id)}
          aria-label={`Connector ${edge.id}`}
          className={`hit-edge ${isSelected(selection, "edge", edge.id) ? "is-selected" : ""}`}
          points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")}
          onPointerDown={(event) => {
            event.stopPropagation();
            onSelect({ kind: "edge", id: edge.id }, event.shiftKey);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect({ kind: "edge", id: edge.id }, false);
            onContextMenu(event.clientX, event.clientY, { kind: "edge", id: edge.id });
          }}
        />;
      })}

      {predicted && (
        <polyline
          className="ghost-route"
          points={predicted.map((point) => `${point.x},${point.y}`).join(" ")}
        />
      )}

      {nodes.map((node) => {
        const place = view.places[node.id];
        if (!isEntityVisible(doc, view, node.id)) return null;
        return (
          <rect
            key={node.id}
            data-interactive
            data-entity-kind="resource"
            data-entity-id={node.id}
            data-node-id={node.id}
            aria-selected={isSelected(selection, "resource", node.id)}
            aria-label={`Resource ${node.serviceLabel}`}
            className={`hit-node ${isSelected(selection, "resource", node.id) ? "is-selected" : ""}`}
            x={node.obstacle.x}
            y={node.obstacle.y}
            width={node.obstacle.w}
            height={node.obstacle.h}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect({ kind: "resource", id: node.id }, event.shiftKey);
              if (tool === "select" && !place?.locked) {
                const origin = placeOrigin(view.places[node.id], node.obstacle);
                beginMove(
                  event,
                  zoom,
                  origin,
                  (x, y, dx, dy) => onMove("resource", node.id, x, y, dx, dy),
                  onGestureBegin,
                  onGestureEnd,
                );
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect({ kind: "resource", id: node.id }, false);
              onContextMenu(event.clientX, event.clientY, {
                kind: "resource",
                id: node.id,
              });
            }}
          />
        );
      })}

      {doc.annotations.map((annotation) => {
        const place = view.annotations?.[annotation.id];
        if (place?.visible === false) return null;
        const rect = {
          x: place?.x ?? 48,
          y: place?.y ?? 48,
          w: place?.w ?? 160,
          h: place?.h ?? 48,
        };
        return (
          <rect
            key={annotation.id}
            data-interactive
            data-entity-kind="annotation"
            data-entity-id={annotation.id}
            aria-selected={isSelected(selection, "annotation", annotation.id)}
            aria-label={`Note ${annotation.text}`}
            className={`hit-annotation ${isSelected(selection, "annotation", annotation.id) ? "is-selected" : ""}`}
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect({ kind: "annotation", id: annotation.id }, event.shiftKey);
              if (tool === "select" && !place?.locked) {
                beginMove(
                  event,
                  zoom,
                  rect,
                  (x, y, dx, dy) => onMove("annotation", annotation.id, x, y, dx, dy),
                  onGestureBegin,
                  onGestureEnd,
                );
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect({ kind: "annotation", id: annotation.id }, false);
              onContextMenu(event.clientX, event.clientY, {
                kind: "annotation",
                id: annotation.id,
              });
            }}
          />
        );
      })}

      {selection.map((item) => {
        const bounds = boundsFor(item, layout, doc);
        const place = item.kind === "annotation" ? view.annotations?.[item.id] : view.places[item.id];
        if (!bounds || item.kind === "edge" || item.kind === "resource" || place?.locked) return null;
        return (
          <g key={`resize-${item.kind}-${item.id}`}>
            {resizeHandles(bounds).map((handle) => (
              <rect
                key={handle.name}
                data-interactive
                data-resize-handle={handle.name}
                aria-label={`Resize ${handle.name}`}
                className="resize-handle"
                x={handle.x - 4}
                y={handle.y - 4}
                width={8}
                height={8}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginResize(
                    event,
                    zoom,
                    bounds,
                    handle.name,
                    (w, h) =>
                      onResize(
                        item.kind as "resource" | "group" | "annotation",
                        item.id,
                        w,
                        h,
                        event.shiftKey,
                      ),
                    onGestureBegin,
                    onGestureEnd,
                  );
                }}
              />
            ))}
          </g>
        );
      })}

      {nodes.flatMap((node) => {
        const selected = isSelected(selection, "resource", node.id);
        if (!showAllPorts && !pendingPort) return [];
        return portPoints(node.icon).map(({ side, point }) => (
          <circle
            key={`${node.id}-${side}`}
            data-interactive
            data-node-id={node.id}
            data-port-side={side}
            aria-label={`${node.serviceLabel} ${side} port`}
            className={`port-handle ${pendingPort?.nodeId === node.id && pendingPort.side === side ? "is-pending" : ""}`}
            cx={point.x}
            cy={point.y}
            r={5}
            onPointerDown={(event) => {
              event.stopPropagation();
              onChoosePort(node.id, side);
            }}
          />
        ));
      })}

      {edgeGeom &&
        edgeGeom.points.map((point, index) => (
          view.places[edgeGeom.id]?.visible === false ? null :
          <circle
            key={`${edgeGeom.id}-bend-${index}`}
            data-interactive
            data-edge-id={edgeGeom.id}
            data-bend-index={index}
            data-endpoint={index === 0 ? "source" : index === edgeGeom.points.length - 1 ? "target" : undefined}
            aria-label={index === 0 ? "Reconnect source endpoint" : index === edgeGeom.points.length - 1 ? "Reconnect target endpoint" : `Move bend ${index}`}
            className="bend-handle"
            cx={point.x}
            cy={point.y}
            r={index === 0 || index === edgeGeom.points.length - 1 ? 6 : 5}
            onPointerDown={(event) => {
              event.stopPropagation();
              if (index === 0 || index === edgeGeom.points.length - 1) {
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
              if (mode !== "manual" || view.places[edgeGeom.id]?.locked) return;
              beginPointMove(
                event,
                zoom,
                edgeGeom.points,
                index,
                onRoute.bind(null, edgeGeom.id),
                onGestureBegin,
                onGestureEnd,
              );
            }}
            onPointerUp={(event) => {
              if (index !== 0 && index !== edgeGeom.points.length - 1) return;
              const target = document.elementFromPoint(event.clientX, event.clientY);
              const nodeId = target?.getAttribute("data-node-id");
              const side = target?.getAttribute("data-port-side") as Side | null;
              if (!nodeId || !side) {
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                  // Pointer capture may already have been released by the browser.
                }
                return;
              }
              onReconnect(
                edgeGeom.id,
                index === 0 ? "source" : "target",
                nodeId,
                side,
              );
              try {
                event.currentTarget.releasePointerCapture(event.pointerId);
              } catch {
                // Pointer capture may already have been released by the browser.
              }
            }}
          />
        ))}

      {edgeGeom &&
        edgeGeom.points.slice(0, -1).map((point, index) => {
          const next = edgeGeom.points[index + 1]!;
          const horizontal = point.y === next.y;
          return (
            <rect
              key={`${edgeGeom.id}-segment-${index}`}
              data-interactive
              data-edge-id={edgeGeom.id}
              data-segment-index={index}
              aria-label={`Move connector segment ${index}`}
              className={`segment-handle ${horizontal ? "is-horizontal" : "is-vertical"}`}
              x={(point.x + next.x) / 2 - 5}
              y={(point.y + next.y) / 2 - 5}
              width={10}
              height={10}
              rx={2}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (mode !== "manual" || view.places[edgeGeom.id]?.locked) return;
                beginSegmentMove(
                  event,
                  zoom,
                  edgeGeom.points,
                  index,
                  onRoute.bind(null, edgeGeom.id),
                  onGestureBegin,
                  onGestureEnd,
                );
              }}
            />
          );
        })}

      {marquee && (
        <rect
          className="marquee"
          x={marquee.x}
          y={marquee.y}
          width={marquee.w}
          height={marquee.h}
        />
      )}
    </svg>
  );
}

function isEntityVisible(
  doc: DiagramDocument,
  view: ReturnType<typeof getDefaultView>,
  id: string,
): boolean {
  if (view.places[id]?.visible === false || view.annotations?.[id]?.visible === false) return false;
  let parent = doc.resources.find((resource) => resource.id === id)?.parent
    ?? doc.groups.find((group) => group.id === id)?.parent;
  while (parent) {
    if (view.places[parent]?.visible === false) return false;
    parent = doc.groups.find((group) => group.id === parent)?.parent;
  }
  return true;
}

function boundsFor(
  item: SelectionItem,
  layout: LayoutResult,
  doc: DiagramDocument,
): { x: number; y: number; w: number; h: number } | null {
  if (item.kind === "resource") {
    const node = layout.nodes.find((candidate) => candidate.id === item.id);
    return node?.obstacle ?? null;
  }
  if (item.kind === "group") {
    const group = layout.groups.find((candidate) => candidate.id === item.id);
    return group?.bounds ?? null;
  }
  if (item.kind === "annotation") {
    const place = getDefaultView(doc).annotations?.[item.id];
    return {
      x: place?.x ?? 48,
      y: place?.y ?? 48,
      w: place?.w ?? 160,
      h: place?.h ?? 48,
    };
  }
  return null;
}

function resizeHandles(rect: { x: number; y: number; w: number; h: number }) {
  return [
    { name: "se", x: rect.x + rect.w, y: rect.y + rect.h },
    { name: "e", x: rect.x + rect.w, y: rect.y + rect.h / 2 },
    { name: "s", x: rect.x + rect.w / 2, y: rect.y + rect.h },
  ];
}

function beginMove(
  event: React.PointerEvent<SVGElement>,
  zoom: number,
  rect: { x: number; y: number },
  onMove: (x: number, y: number, dx: number, dy: number) => void,
  onBegin?: () => void,
  onEnd?: () => void,
) {
  const start = { x: event.clientX, y: event.clientY };
  const origin = { x: rect.x, y: rect.y };
  let dragging = false;
  let previousDx = 0;
  let previousDy = 0;
  const threshold = 4;

  const move = (next: PointerEvent) => {
    const rawDx = (next.clientX - start.x) / zoom;
    const rawDy = (next.clientY - start.y) / zoom;
    if (!dragging && Math.hypot(rawDx, rawDy) < threshold) return;
    if (!dragging) {
      dragging = true;
      onBegin?.();
    }
    const dx = snap(rawDx);
    const dy = snap(rawDy);
    const incrementalDx = dx - previousDx;
    const incrementalDy = dy - previousDy;
    previousDx = dx;
    previousDy = dy;
    onMove(snap(origin.x + dx), snap(origin.y + dy), incrementalDx, incrementalDy);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    if (dragging) onEnd?.();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function placeOrigin(
  place: { x?: number; y?: number; pin?: boolean } | undefined,
  bounds: { x: number; y: number },
): { x: number; y: number } {
  if (place?.pin && place.x !== undefined && place.y !== undefined) {
    return { x: place.x, y: place.y };
  }
  return { x: bounds.x, y: bounds.y };
}

function beginResize(
  event: React.PointerEvent<SVGElement>,
  zoom: number,
  rect: { x: number; y: number; w: number; h: number },
  handle: string,
  onResize: (w: number, h: number) => void,
  onBegin?: () => void,
  onEnd?: () => void,
) {
  onBegin?.();
  const start = { x: event.clientX, y: event.clientY };
  const origin = { ...rect };
  const move = (next: PointerEvent) => {
    const dx = (next.clientX - start.x) / zoom;
    const dy = (next.clientY - start.y) / zoom;
    const w = handle.includes("e") ? Math.max(32, snap(origin.w + dx)) : origin.w;
    const h = handle.includes("s") ? Math.max(32, snap(origin.h + dy)) : origin.h;
    onResize(w, h);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    onEnd?.();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginSegmentMove(
  event: React.PointerEvent<SVGElement>,
  zoom: number,
  points: Point[],
  index: number,
  onMove: (points: Point[]) => void,
  onBegin?: () => void,
  onEnd?: () => void,
) {
  onBegin?.();
  const start = { x: event.clientX, y: event.clientY };
  const origin = points.map((point) => ({ ...point }));
  const horizontal = origin[index]!.y === origin[index + 1]!.y;
  const move = (next: PointerEvent) => {
    const updated = origin.map((point) => ({ ...point }));
    if (horizontal) {
      const y = snap(origin[index]!.y + (next.clientY - start.y) / zoom);
      updated[index]!.y = y;
      updated[index + 1]!.y = y;
    } else {
      const x = snap(origin[index]!.x + (next.clientX - start.x) / zoom);
      updated[index]!.x = x;
      updated[index + 1]!.x = x;
    }
    onMove(updated);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    onEnd?.();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function beginPointMove(
  event: React.PointerEvent<SVGElement>,
  zoom: number,
  points: Point[],
  index: number,
  onMove: (points: Point[]) => void,
  onBegin?: () => void,
  onEnd?: () => void,
) {
  onBegin?.();
  const start = { x: event.clientX, y: event.clientY };
  const origin = points.map((point) => ({ ...point }));
  const move = (next: PointerEvent) => {
    const updated = origin.map((point) => ({ ...point }));
    updated[index] = {
      x: snap(origin[index]!.x + (next.clientX - start.x) / zoom),
      y: snap(origin[index]!.y + (next.clientY - start.y) / zoom),
    };
    onMove(updated);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    onEnd?.();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function portPoints(rect: { x: number; y: number; w: number; h: number }) {
  return [
    { side: "n" as const, point: { x: rect.x + rect.w / 2, y: rect.y } },
    { side: "e" as const, point: { x: rect.x + rect.w, y: rect.y + rect.h / 2 } },
    { side: "s" as const, point: { x: rect.x + rect.w / 2, y: rect.y + rect.h } },
    { side: "w" as const, point: { x: rect.x, y: rect.y + rect.h / 2 } },
  ];
}

function rectFromPoints(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

function snap(value: number): number {
  return Math.round(value / 8) * 8;
}
