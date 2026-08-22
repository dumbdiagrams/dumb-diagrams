import type {
  DiagramDocument,
  EdgeBadgeSide,
  EdgeLabelSide,
  EdgeKind,
  EdgeStyle,
  LayoutResult,
  Point,
  Side,
} from "@dumb-diagrams/core";
import {
  getDefaultView,
  normalizePortOffset,
  portPoint,
  portAnchors,
} from "@dumb-diagrams/core";
import {
  getEdgeBadgePlacement,
  getEdgeLabelPlacementOnPath,
  normalizeOrthogonalRoute,
  projectPointToPolyline,
  routeConnectionPreview,
  routeEdgePreview,
} from "@dumb-diagrams/route";
import { useMemo, useRef, useState } from "react";

import {
  isSelected,
  type Selection,
  type SelectionItem,
} from "../editor-model";
import { snapCoordinate } from "../grid.js";
import { nearestEdgeIdAt, nearestNodePortAt } from "./edge-targeting.js";
import {
  anchorOrthogonalRouteEndpoints,
  moveOrthogonalBend,
} from "./route-editing.js";

type Tool = "select" | "connector" | "resources" | "groups" | "code" | "layers" | "note" | "text";
type RewireTarget = { nodeId: string; side: Side; offset: number };
type BadgeDrag = {
  edgeId: string;
  t: number;
  side: EdgeBadgeSide;
} | null;
type LabelDrag = {
  edgeId: string;
  t: number;
  side: EdgeLabelSide;
} | null;

export function InteractionOverlay({
  doc,
  layout,
  tool,
  zoom,
  snapToGrid,
  selection,
  pendingPort,
  ghostRoute,
  onSelect,
  onEditText,
  onMarquee,
  onBackgroundClick,
  onChoosePort,
  onConnectPorts,
  onReconnect,
  onGestureBegin,
  onGestureEnd,
  onMove,
  onResize,
  onRoute,
  onBadgeMove,
  onLabelMove,
  onContextMenu,
}: {
  doc: DiagramDocument;
  layout: LayoutResult;
  tool: Tool;
  zoom: number;
  snapToGrid: boolean;
  selection: Selection;
  pendingPort: { nodeId: string; side: Side; offset: number } | null;
  ghostRoute: Point[] | null;
  onSelect: (item: SelectionItem, additive: boolean) => void;
  onEditText: (item: SelectionItem) => void;
  onMarquee: (rect: { x: number; y: number; w: number; h: number }) => void;
  onBackgroundClick: () => void;
  onChoosePort: (nodeId: string, side: Side, offset: number) => void;
  onConnectPorts: (
    sourceNodeId: string,
    sourceSide: Side,
    sourceOffset: number,
    targetNodeId: string,
    targetSide: Side,
    targetOffset: number,
  ) => void;
  onReconnect: (
    edgeId: string,
    endpoint: "source" | "target",
    nodeId: string,
    side: Side,
    offset: number,
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
  onBadgeMove: (edgeId: string, t: number, side: EdgeBadgeSide) => void;
  onLabelMove: (edgeId: string, t: number, side: EdgeLabelSide) => void;
  onContextMenu: (
    clientX: number,
    clientY: number,
    item: SelectionItem | null,
  ) => void;
}) {
  const view = getDefaultView(doc);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [rewire, setRewire] = useState<{
    edgeId: string;
    endpoint: "source" | "target";
  } | null>(null);
  const [rewireTarget, setRewireTarget] = useState<RewireTarget | null>(null);
  const [rewirePreview, setRewirePreview] = useState<Point[] | null>(null);
  const [connectorDrag, setConnectorDrag] = useState<{
    source: RewireTarget;
    cursor: Point;
    target: RewireTarget | null;
    preview: Point[];
  } | null>(null);
  const [hoveredItem, setHoveredItem] = useState<SelectionItem | null>(null);
  const [badgeDrag, setBadgeDrag] = useState<BadgeDrag>(null);
  const labelDragRef = useRef<LabelDrag>(null);

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
  const showAllPorts = tool === "connector" || rewire !== null;
  const quickConnectNodeIds = new Set([
    ...selection.filter((item) => item.kind === "resource").map((item) => item.id),
    ...(hoveredItem?.kind === "resource" ? [hoveredItem.id] : []),
  ]);

  const selectedEdge = selection.find((item) => item.kind === "edge");
  const edgeGeom = selectedEdge
    ? layout.edges.find((edge) => edge.id === selectedEdge.id)
    : undefined;
  const edgeModel = selectedEdge
    ? doc.edges.find((edge) => edge.id === selectedEdge.id)
    : undefined;
  const showEdgeHandles = Boolean(edgeGeom && tool === "select");
  const showBendHandles = showEdgeHandles;

  const commitRoute = (edgeId: string, points: Point[]) => {
    const edge = doc.edges.find((candidate) => candidate.id === edgeId);
    const source = edge ? layout.nodes.find((node) => node.id === edge.source) : undefined;
    const target = edge ? layout.nodes.find((node) => node.id === edge.target) : undefined;
    const anchored = source && target
      ? anchorOrthogonalRouteEndpoints(points, source.icon, target.icon)
      : points;
    onRoute(edgeId, normalizeOrthogonalRoute(anchored));
  };

  const closestTargetAt = (clientX: number, clientY: number): SelectionItem | null => {
    const point = pointFromClient(
      document.querySelector<SVGSVGElement>('[data-testid="canvas-interaction-overlay"]'),
      clientX,
      clientY,
      zoom,
    );
    return closestInteractiveTarget(point, layout, doc, view);
  };

  const updateHover = (event: React.PointerEvent<SVGElement>) => {
    if (tool !== "select") return;
    const closest = closestTargetAt(event.clientX, event.clientY);
    if (closest) {
      setHoveredItem(closest);
      return;
    }
    const kind = event.currentTarget.getAttribute("data-entity-kind") as SelectionItem["kind"] | null;
    const id = event.currentTarget.getAttribute("data-entity-id");
    setHoveredItem(kind && id ? { kind, id } : null);
  };

  const clearHover = (kind: SelectionItem["kind"], id: string) => {
    setHoveredItem((current) =>
      current?.kind === kind && current.id === id ? null : current,
    );
  };

  const predicted =
    ghostRoute ??
    (selectedEdge
      ? routeEdgePreview(doc, layout, selectedEdge.id) ?? undefined
      : undefined);
  const activePortTarget = rewireTarget ?? connectorDrag?.target;

  const portTargetAt = (
    svg: SVGSVGElement | null,
    clientX: number,
    clientY: number,
    preferred?: RewireTarget | null,
  ): RewireTarget | null =>
    portAt(clientX, clientY) ??
    nearestNodePortAt(
      pointFromClient(svg, clientX, clientY, zoom),
      layout.nodes,
      24,
      preferred,
    );

  const beginRewire = (
    event: React.PointerEvent<SVGRectElement>,
    edgeId: string,
    endpoint: "source" | "target",
  ) => {
    const handle = event.currentTarget;
    const svg = handle.ownerSVGElement;
    const edge = doc.edges.find((candidate) => candidate.id === edgeId);
    const currentTarget = edge
      ? {
          nodeId: endpoint === "source" ? edge.source : edge.target,
          side: endpoint === "source" ? edge.sourcePort : edge.targetPort,
          offset: normalizePortOffset(
            endpoint === "source" ? edge.sourcePortOffset : edge.targetPortOffset,
          ),
        }
      : null;
    const pointerId = event.pointerId;
    const dragStart = { x: event.clientX, y: event.clientY };
    let didDrag = false;
    let latestTarget: RewireTarget | null = null;

    handle.setPointerCapture(pointerId);
    onGestureBegin();
    setRewire({ edgeId, endpoint });
    setRewireTarget(null);
    setRewirePreview(
      layout.edges.find((candidate) => candidate.id === edgeId)?.points ?? null,
    );

    const previewFor = (cursor: Point, target: RewireTarget | null): Point[] => {
      if (!edge || !target) {
        const fixed = endpoint === "source"
          ? layout.edges.find((candidate) => candidate.id === edgeId)?.points.at(-1)
          : layout.edges.find((candidate) => candidate.id === edgeId)?.points[0];
        return fixed ? normalizeOrthogonalRoute([fixed, cursor]) : [cursor, cursor];
      }
      return routeEdgePreview(doc, layout, edgeId, endpoint === "source"
        ? {
            source: target.nodeId,
            sourcePort: target.side,
            sourcePortOffset: target.offset,
          }
        : {
            target: target.nodeId,
            targetPort: target.side,
            targetPortOffset: target.offset,
        }) ?? [cursor, cursor];
    };
    const preview = createFramePreview<{ cursor: Point; target: RewireTarget | null }>(({ cursor, target }) => {
      setRewireTarget(target);
      setRewirePreview(previewFor(cursor, target));
    });

    const move = (next: PointerEvent) => {
      if (Math.hypot(next.clientX - dragStart.x, next.clientY - dragStart.y) >= 3) {
        didDrag = true;
      }
      const cursor = pointFromClient(svg, next.clientX, next.clientY, zoom);
      const target = portTargetAt(
        svg,
        next.clientX,
        next.clientY,
        latestTarget,
      );
      latestTarget = target;
      preview.schedule({ cursor, target });
    };
    const finish = (next?: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (next) move(next);
      preview.flush();
      // Commit the exact mount represented by the last rendered preview.
      // Re-resolving on pointerup can see a different DOM layer after React
      // updates and used to make a highlighted port silently fail to attach.
      const target = next && didDrag ? latestTarget : null;
      if (
        target &&
        (!currentTarget ||
          target.nodeId !== currentTarget.nodeId ||
          target.side !== currentTarget.side ||
          target.offset !== currentTarget.offset)
      ) {
        onReconnect(edgeId, endpoint, target.nodeId, target.side, target.offset);
      }
      setRewire(null);
      setRewireTarget(null);
      setRewirePreview(null);
      onGestureEnd();
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    };
    const up = (next: PointerEvent) => finish(next);
    const cancel = () => finish();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const beginConnectorDrag = (
    event: React.PointerEvent<SVGCircleElement>,
    source: RewireTarget,
  ) => {
    const handle = event.currentTarget;
    const svg = handle.ownerSVGElement;
    const sourceNode = layout.nodes.find((node) => node.id === source.nodeId);
    const sourcePoint = sourceNode
      ? portPoint(sourceNode.icon, source.side, source.offset)
      : pointFromClient(svg, event.clientX, event.clientY, zoom);
    const pointerId = event.pointerId;
    let latestTarget: RewireTarget | null = null;

    const previewFor = (cursor: Point, target: RewireTarget | null): Point[] => {
      if (!target) return [sourcePoint, cursor];
      return routeConnectionPreview(doc, layout, source.nodeId, target.nodeId, {
        sourcePort: source.side,
        targetPort: target.side,
        sourcePortOffset: source.offset,
        targetPortOffset: target.offset,
        style: "solid",
        kind: "flow",
      }) ?? [sourcePoint, cursor];
    };
    const preview = createFramePreview<{ cursor: Point; target: RewireTarget | null }>(({ cursor, target }) => {
      setConnectorDrag({
        source,
        cursor,
        target,
        preview: previewFor(cursor, target),
      });
    });

    const update = (next: PointerEvent) => {
      const cursor = pointFromClient(svg, next.clientX, next.clientY, zoom);
      const candidate = portTargetAt(
        svg,
        next.clientX,
        next.clientY,
        latestTarget,
      );
      const target = candidate?.nodeId === source.nodeId ? null : candidate;
      latestTarget = target;
      preview.schedule({ cursor, target });
    };
    const finish = (next?: PointerEvent) => {
      window.removeEventListener("pointermove", update);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (next) update(next);
      preview.flush();
      const target = next ? latestTarget : null;
      if (target) {
        onConnectPorts(
          source.nodeId,
          source.side,
          source.offset,
          target.nodeId,
          target.side,
          target.offset,
        );
      }
      setConnectorDrag(null);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    };
    const up = (next: PointerEvent) => finish(next);
    const cancel = () => finish();

    try {
      handle.setPointerCapture(pointerId);
    } catch {
      // Some synthetic/browser pointer events do not support capture.
    }
    setConnectorDrag({ source, cursor: sourcePoint, target: null, preview: [sourcePoint, sourcePoint] });
    window.addEventListener("pointermove", update);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const beginBadgeMove = (
    event: React.PointerEvent<SVGGElement>,
    edgeId: string,
    points: Point[],
    initialT: number,
    initialSide: EdgeBadgeSide,
  ) => {
    const handle = event.currentTarget;
    const svg = handle.ownerSVGElement;
    const pointerId = event.pointerId;
    let lastT = initialT;
    let lastSide = initialSide;
    const preview = createFramePreview<{ t: number; side: EdgeBadgeSide }>((placement) => {
      setBadgeDrag({ edgeId, t: placement.t, side: placement.side });
      onBadgeMove(edgeId, placement.t, placement.side);
    });

    handle.setPointerCapture(pointerId);
    onGestureBegin();
    setBadgeDrag({ edgeId, t: initialT, side: initialSide });

    const move = (next: PointerEvent) => {
      const pointer = pointFromClient(svg, next.clientX, next.clientY, zoom);
      const projection = projectPointToPolyline(pointer, points);
      if (!projection) return;
      lastT = projection.t;
      lastSide = badgeSideAt(pointer, projection.point, projection.tangent);
      preview.schedule({ t: lastT, side: lastSide });
    };
    const finish = (next?: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (next) move(next);
      preview.flush();
      setBadgeDrag(null);
      onGestureEnd();
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    };
    const up = (next: PointerEvent) => finish(next);
    const cancel = () => finish();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  const beginLabelMove = (
    event: React.PointerEvent<SVGRectElement>,
    edgeId: string,
    points: Point[],
    label: string,
    initialT: number,
    initialSide: EdgeLabelSide,
  ) => {
    const handle = event.currentTarget;
    const svg = handle.ownerSVGElement;
    const pointerId = event.pointerId;
    let lastT = initialT;
    let lastSide = initialSide;
    let didDrag = false;
    const dragStart = { x: event.clientX, y: event.clientY };
    const labelText = document
      .getElementById(`edge-${edgeId}`)
      ?.querySelector<SVGTextElement>("text.edge-label");
    let selectionOutlines: SVGRectElement[] | undefined;

    const applyPlacement = (placement: ReturnType<typeof getEdgeLabelPlacementOnPath>) => {
      if (!placement) return;
      labelText?.setAttribute("x", String(placement.point.x));
      labelText?.setAttribute("y", String(placement.point.y));
      handle.setAttribute("x", String(placement.rect.x));
      handle.setAttribute("y", String(placement.rect.y));
      handle.setAttribute("width", String(placement.rect.w));
      handle.setAttribute("height", String(placement.rect.h));

      // React may render the selection outline after the pointerdown event.
      // Resolve it lazily so the outline follows the same imperative preview.
      if (!selectionOutlines?.length) {
        selectionOutlines = Array.from(
          document.querySelectorAll<SVGRectElement>("[data-selection-edge-label]"),
        ).filter((candidate) => candidate.getAttribute("data-selection-edge-label") === edgeId);
      }
      for (const outline of selectionOutlines) {
        outline.setAttribute("x", String(placement.rect.x));
        outline.setAttribute("y", String(placement.rect.y));
        outline.setAttribute("width", String(placement.rect.w));
        outline.setAttribute("height", String(placement.rect.h));
      }
    };

    handle.setPointerCapture(pointerId);
    onGestureBegin();
    setHoveredItem(null);
    labelDragRef.current = { edgeId, t: initialT, side: initialSide };
    applyPlacement(getEdgeLabelPlacementOnPath(points, label, initialT, initialSide));

    const move = (next: PointerEvent) => {
      if (Math.hypot(next.clientX - dragStart.x, next.clientY - dragStart.y) >= 3) {
        didDrag = true;
      }
      const pointer = pointFromClient(svg, next.clientX, next.clientY, zoom);
      const projection = projectPointToPolyline(pointer, points);
      if (!projection) return;
      lastT = projection.t;
      lastSide = labelSideAt(pointer, projection.point, projection.tangent);
      labelDragRef.current = { edgeId, t: lastT, side: lastSide };
      applyPlacement(getEdgeLabelPlacementOnPath(points, label, lastT, lastSide));
    };
    const finish = (next?: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (next) move(next);
      const final = labelDragRef.current;
      if (next && didDrag && final && (final.t !== initialT || final.side !== initialSide)) {
        onLabelMove(final.edgeId, final.t, final.side);
      } else if (!next) {
        applyPlacement(getEdgeLabelPlacementOnPath(points, label, initialT, initialSide));
      }
      labelDragRef.current = null;
      onGestureEnd();
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    };
    const up = (next: PointerEvent) => finish(next);
    const cancel = () => finish();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  };

  return (
    <svg
      className={`interaction-overlay${tool === "select" ? " is-select-tool" : ""}${tool === "text" ? " is-text-tool" : ""}`}
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
          window.removeEventListener("pointercancel", cancel);
          const current = toSvg(next.clientX, next.clientY);
          const rect = rectFromPoints(start, current);
          setMarquee(null);
          if (rect.w > 4 || rect.h > 4) onMarquee(rect);
          else onBackgroundClick();
        };
        const cancel = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", cancel);
          setMarquee(null);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if ((event.target as Element).closest("[data-interactive]")) return;
        onContextMenu(event.clientX, event.clientY, null);
      }}
    >
      <defs>
        <marker
          id="connector-preview-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="9.5"
          refY="5"
          viewBox="0 0 10 10"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L10,5 L0,10 Z" className="connector-preview-arrow" />
        </marker>
      </defs>
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
            pointerEvents="all"
            strokeWidth={18}
            onPointerEnter={updateHover}
            onPointerMove={updateHover}
            onPointerLeave={() => clearHover("group", group.id)}
            onPointerDown={(event) => {
              event.stopPropagation();
              const target = closestTargetAt(event.clientX, event.clientY)
                ?? { kind: "group" as const, id: group.id };
              onSelect(target, event.shiftKey);
              if (tool === "select" && target.kind !== "edge") {
                const targetGroup = layout.groups.find((candidate) => candidate.id === target.id);
                const targetPlace = targetGroup ? view.places[targetGroup.id] : undefined;
                if (target.kind === "group" && targetGroup && !targetPlace?.locked) {
                  const origin = placeOrigin(targetPlace, targetGroup.bounds);
                  const active = selection.some(
                    (candidate) => candidate.kind === target.kind && candidate.id === target.id,
                  ) ? selection : [target];
                  beginMove(
                    event,
                    zoom,
                    snapToGrid,
                    origin,
                    (x, y, dx, dy) => onMove("group", target.id, x, y, dx, dy),
                    createMovePreview(event.currentTarget.ownerSVGElement, doc, active),
                  );
                }
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu(
                event.clientX,
                event.clientY,
                closestTargetAt(event.clientX, event.clientY) ?? { kind: "group", id: group.id },
              );
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
          pointerEvents="stroke"
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (view.places[edge.id]?.locked) return;
            const point = pointFromClient(
              event.currentTarget.ownerSVGElement,
              event.clientX,
              event.clientY,
              zoom,
            );
            const projection = projectPointToPolyline(point, edge.points);
            if (!projection) return;
            const insertAt = projection.segmentIndex + 1;
            const next = normalizeOrthogonalRoute([
              ...edge.points.slice(0, insertAt),
              projection.point,
              ...edge.points.slice(insertAt),
            ]);
            onSelect({ kind: "edge", id: edge.id }, false);
            // A double-click intentionally authors a straight-through break.
            // Keep it until the user later collapses it through a drag.
            onRoute(edge.id, next);
          }}
          onPointerEnter={updateHover}
          onPointerMove={updateHover}
          onPointerLeave={() => clearHover("edge", edge.id)}
          onPointerDown={(event) => {
            event.stopPropagation();
            // Resolve the nearest connector at the pointer rather than using
            // whichever widened SVG stroke happens to be on top. This keeps
            // adjacent routes selectable independently.
            const point = pointFromClient(
              event.currentTarget.ownerSVGElement,
              event.clientX,
              event.clientY,
              zoom,
            );
            onSelect(
              nearestEdgeAt(point, layout, doc, view, edge.id) ?? { kind: "edge", id: edge.id },
              event.shiftKey,
            );
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onContextMenu(
              event.clientX,
              event.clientY,
              { kind: "edge", id: edge.id },
            );
          }}
        />;
      })}

      {edges.map((edge) => {
        if (
          !edge.label ||
          !edge.labelRect ||
          view.places[edge.id]?.visible === false ||
          !isEntityVisible(doc, view, edge.source) ||
          !isEntityVisible(doc, view, edge.target)
        ) return null;
        const rect = edge.labelRect;
        const labelT = edge.labelT ?? 0.5;
        const labelSide = edge.labelSide ?? "top";
        return (
          <rect
            key={`${edge.id}-label-hit`}
            data-interactive
            data-entity-kind="edge"
            data-entity-id={edge.id}
            data-edge-label-hit
            data-edge-label-handle={edge.id}
            aria-label={`Connector label ${edge.label}`}
            className="hit-edge-label"
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            pointerEvents="all"
            onPointerEnter={updateHover}
            onPointerMove={(event) => {
              if (!labelDragRef.current) updateHover(event);
            }}
            onPointerLeave={() => clearHover("edge", edge.id)}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect({ kind: "edge", id: edge.id }, event.shiftKey);
              if (tool === "select" && !view.places[edge.id]?.locked) {
                beginLabelMove(
                  event,
                  edge.id,
                  edge.points,
                  edge.label,
                  labelT,
                  labelSide,
                );
              }
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect({ kind: "edge", id: edge.id }, false);
              onEditText({ kind: "edge", id: edge.id });
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu(event.clientX, event.clientY, { kind: "edge", id: edge.id });
            }}
          />
        );
      })}

      {predicted && (
        <polyline
          className="ghost-route"
          points={predicted.map((point) => `${point.x},${point.y}`).join(" ")}
        />
      )}

      {connectorDrag && (
        <g data-connector-drag-preview>
          <polyline
            data-connector-drag-path
            className={`connector-drag-preview${connectorDrag.target ? " is-snapped" : ""}`}
            points={connectorDrag.preview
              .map((point) => `${point.x},${point.y}`)
              .join(" ")}
            markerEnd="url(#connector-preview-arrow)"
          />
          <circle
            data-connector-drag-cursor
            className="connector-drag-cursor"
            cx={connectorDrag.cursor.x}
            cy={connectorDrag.cursor.y}
            r={connectorDrag.target ? 7 : 5}
          />
        </g>
      )}

      {rewire && rewirePreview && edgeGeom && rewire.edgeId === edgeGeom.id && (() => {
        const activePoint = rewire.endpoint === "source"
          ? rewirePreview[0]
          : rewirePreview.at(-1);
        return (
          <g data-rewire-drag-preview>
            <polyline
              className={`rewire-preview${rewireTarget ? " is-snapped" : ""}`}
              points={rewirePreview.map((point) => `${point.x},${point.y}`).join(" ")}
              markerEnd="url(#connector-preview-arrow)"
            />
            {activePoint && (
              <circle
                data-rewire-preview-endpoint
                className={`rewire-preview-endpoint${rewireTarget ? " is-snapped" : ""}`}
                cx={activePoint.x}
                cy={activePoint.y}
                r={rewireTarget ? 5.5 : 4.5}
              />
            )}
          </g>
        );
      })()}

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
            onPointerEnter={updateHover}
            onPointerMove={updateHover}
            onPointerLeave={() => clearHover("resource", node.id)}
            onPointerDown={(event) => {
              event.stopPropagation();
              const target = closestTargetAt(event.clientX, event.clientY)
                ?? { kind: "resource" as const, id: node.id };
              onSelect(target, event.shiftKey);
              if (tool === "select" && target.kind === "resource") {
                const targetNode = layout.nodes.find((candidate) => candidate.id === target.id);
                const targetPlace = targetNode ? view.places[targetNode.id] : undefined;
                if (!targetNode || targetPlace?.locked) return;
                const origin = placeOrigin(targetPlace, targetNode.obstacle);
                const active = selection.some(
                  (candidate) => candidate.kind === target.kind && candidate.id === target.id,
                ) ? selection : [target];
                beginMove(
                  event,
                  zoom,
                  snapToGrid,
                  origin,
                  (x, y, dx, dy) => onMove("resource", target.id, x, y, dx, dy),
                  createMovePreview(event.currentTarget.ownerSVGElement, doc, active),
                );
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu(
                event.clientX,
                event.clientY,
                closestTargetAt(event.clientX, event.clientY) ?? { kind: "resource", id: node.id },
              );
            }}
          />
        );
      })}

      {doc.annotations.map((annotation) => {
        const place = view.annotations?.[annotation.id];
        if (place?.visible === false) return null;
        const isText = annotation.style === "text";
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
            data-annotation-style={annotation.style ?? "paper"}
            aria-selected={isSelected(selection, "annotation", annotation.id)}
            aria-label={`${isText ? "Text" : "Note"} ${annotation.text}`}
            className={`hit-annotation${isText ? " hit-annotation-text" : ""}${isSelected(selection, "annotation", annotation.id) ? " is-selected" : ""}`}
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            onPointerEnter={updateHover}
            onPointerMove={updateHover}
            onPointerLeave={() => clearHover("annotation", annotation.id)}
            onPointerDown={(event) => {
              event.stopPropagation();
              const target = closestTargetAt(event.clientX, event.clientY)
                ?? { kind: "annotation" as const, id: annotation.id };
              onSelect(target, event.shiftKey);
              if (tool === "select" && target.kind === "annotation" && !place?.locked) {
                const active = selection.some(
                  (candidate) => candidate.kind === target.kind && candidate.id === target.id,
                ) ? selection : [target];
                beginMove(
                  event,
                  zoom,
                  snapToGrid,
                  rect,
                  (x, y, dx, dy) => onMove("annotation", target.id, x, y, dx, dy),
                  createMovePreview(event.currentTarget.ownerSVGElement, doc, active),
                );
              }
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect({ kind: "annotation", id: annotation.id }, false);
              onEditText({ kind: "annotation", id: annotation.id });
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu(
                event.clientX,
                event.clientY,
                closestTargetAt(event.clientX, event.clientY) ?? { kind: "annotation", id: annotation.id },
              );
            }}
          />
        );
      })}

      {hoveredItem?.kind === "edge" && (() => {
        const hoveredEdge = layout.edges.find((edge) => edge.id === hoveredItem.id);
        if (!hoveredEdge) return null;
        return (
          <g>
            <polyline
              data-hover-kind="edge"
              data-hover-id={hoveredItem.id}
              className="hover-edge"
              points={hoveredEdge.points
                .map((point) => `${point.x},${point.y}`)
                .join(" ")}
            />
            {hoveredEdge.labelRect && (
              <rect
                data-hover-kind="edge-label"
                data-hover-id={hoveredItem.id}
                className="hover-edge-label"
                x={hoveredEdge.labelRect.x}
                y={hoveredEdge.labelRect.y}
                width={hoveredEdge.labelRect.w}
                height={hoveredEdge.labelRect.h}
                rx={5}
              />
            )}
          </g>
        );
      })()}
      {hoveredItem && hoveredItem.kind !== "edge" && (() => {
        const bounds = boundsFor(hoveredItem, layout, doc);
        if (!bounds) return null;
        return (
          <rect
            data-hover-kind={hoveredItem.kind}
            data-hover-id={hoveredItem.id}
            className={`hover-outline hover-${hoveredItem.kind}`}
            x={bounds.x}
            y={bounds.y}
            width={bounds.w}
            height={bounds.h}
            rx={hoveredItem.kind === "group" ? 10 : 8}
          />
        );
      })()}

      {selection.map((item) => {
        const bounds = boundsFor(item, layout, doc);
        if (!bounds || !isEntityVisible(doc, view, item.id)) return null;
        const radius = item.kind === "group" ? 10 : 8;
        const isText = item.kind === "annotation" && doc.annotations.some(
          (annotation) => annotation.id === item.id && annotation.style === "text",
        );
        const isEdgeLabel = item.kind === "edge" && Boolean(
          layout.edges.find((edge) => edge.id === item.id)?.labelRect,
        );
        return (
          <g
            key={`selection-outline-${item.kind}-${item.id}`}
            data-drag-overlay-kind={item.kind}
            data-drag-overlay-id={item.id}
          >
            <rect
              className="selection-outline-halo"
              data-selection-edge-label={isEdgeLabel ? item.id : undefined}
              x={bounds.x}
              y={bounds.y}
              width={bounds.w}
              height={bounds.h}
              rx={radius}
            />
            <rect
              className={`selection-outline selection-${item.kind}${isText ? " selection-text" : ""}${isEdgeLabel ? " selection-edge-label" : ""}`}
              data-selection-edge-label={isEdgeLabel ? item.id : undefined}
              x={bounds.x}
              y={bounds.y}
              width={bounds.w}
              height={bounds.h}
              rx={radius}
            />
          </g>
        );
      })}

      {selection.map((item) => {
        const bounds = boundsFor(item, layout, doc);
        const place = item.kind === "annotation" ? view.annotations?.[item.id] : view.places[item.id];
        if (!bounds || item.kind === "edge" || item.kind === "resource" || place?.locked) return null;
        return (
          <g
            key={`resize-${item.kind}-${item.id}`}
            data-drag-overlay-kind={item.kind}
            data-drag-overlay-id={item.id}
          >
            {resizeHandles(bounds).map((handle) => (
              <rect
                key={handle.name}
                data-interactive
                data-resize-kind={item.kind}
                data-resize-handle={handle.name}
                aria-label={item.kind === "group" ? `Resize group ${handle.name}` : `Resize ${handle.name}`}
                className={`resize-handle${item.kind === "group" ? " group-resize-handle" : ""}`}
                x={handle.x - (item.kind === "group" ? 6 : 4)}
                y={handle.y - (item.kind === "group" ? 6 : 4)}
                width={item.kind === "group" ? 12 : 8}
                height={item.kind === "group" ? 12 : 8}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginResize(
                    event,
                    zoom,
                    snapToGrid,
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
        const showQuickPorts = showAllPorts || Boolean(pendingPort) || quickConnectNodeIds.has(node.id);
        if (!showQuickPorts) return [];
        const compact = !showAllPorts && !pendingPort;
        return (
          <g
            key={`${node.id}-ports`}
            className={`quick-connect-control${compact ? " is-compact" : ""}`}
            data-quick-connect={node.id}
            aria-label={`Connect from ${node.serviceLabel}`}
            onPointerEnter={() => setHoveredItem({ kind: "resource", id: node.id })}
            onPointerLeave={() => clearHover("resource", node.id)}
          >
            {compact && (
              <rect
                className="quick-connect-frame"
                x={node.icon.x - 10}
                y={node.icon.y - 10}
                width={node.icon.w + 20}
                height={node.icon.h + 20}
                rx={12}
              />
            )}
            {portPoints(node.icon).map(({ side, offset, point }) => (
              <g
                key={`${node.id}-${side}-${offset}`}
                className="port-control"
              >
                <circle
                  data-interactive
                  data-node-id={node.id}
                  data-port-side={side}
                  data-port-offset={offset}
                  aria-label={`${node.serviceLabel} ${side.toUpperCase()} port at ${Math.round(offset * 100)}%`}
                  aria-pressed={pendingPort?.nodeId === node.id && pendingPort.side === side && pendingPort.offset === offset}
                  className="port-hit-area"
                  cx={point.x}
                  cy={point.y}
                  r={compact ? 6 : 8}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (pendingPort) {
                      onChoosePort(node.id, side, offset);
                      return;
                    }
                    onChoosePort(node.id, side, offset);
                    beginConnectorDrag(event, { nodeId: node.id, side, offset });
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
                <circle
                  className="port-handle-halo"
                  cx={point.x}
                  cy={point.y}
                  r={compact ? 8 : 7}
                />
                <circle
                  data-port-visual
                  className={`port-handle ${pendingPort?.nodeId === node.id && pendingPort.side === side && pendingPort.offset === offset ? "is-pending" : ""} ${activePortTarget?.nodeId === node.id && activePortTarget.side === side && activePortTarget.offset === offset ? "is-rewire-target" : ""}`}
                  cx={point.x}
                  cy={point.y}
                  r={compact ? 4.5 : 4}
                />
              </g>
            ))}
          </g>
        );
      })}

      {edgeGeom && edgeModel?.step !== undefined && edgeGeom.badge && (() => {
        const dragging = badgeDrag?.edgeId === edgeGeom.id ? badgeDrag : null;
        const current = dragging
          ? getEdgeBadgePlacement(edgeGeom.points, dragging.t, dragging.side)
          : {
              point: edgeGeom.badge!,
              t: edgeGeom.badgeT ?? 0.5,
              side: edgeGeom.badgeSide ?? "top" as const,
            };
        if (!current) return null;
        const oppositeSide: EdgeBadgeSide = current.side === "top" ? "bottom" : "top";
        const predictedBadge = dragging
          ? getEdgeBadgePlacement(edgeGeom.points, current.t, oppositeSide)
          : undefined;
        const currentPoint = stableBadgePoint(current.point);
        const predictedPoint = predictedBadge
          ? stableBadgePoint(predictedBadge.point)
          : undefined;
        return (
          <g key={`${edgeGeom.id}-badge`}>
            {predictedPoint && (
              <g
                data-edge-badge-preview
                data-edge-id={edgeGeom.id}
                className="edge-badge-prediction"
                transform={`translate(${predictedPoint.x} ${predictedPoint.y})`}
              >
                <circle className="edge-badge-preview-ring" r={15} />
                <circle className="edge-badge-preview-core" r={10} />
                <text className="edge-badge-preview-text" x={0} y={0} textAnchor="middle">
                  {edgeModel.step}
                </text>
              </g>
            )}
            <g
              data-interactive
              data-edge-badge={edgeGeom.id}
              data-edge-id={edgeGeom.id}
              aria-label={`Move number ${edgeModel.step}`}
              className="edge-badge-handle"
              transform={`translate(${currentPoint.x} ${currentPoint.y})`}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (view.places[edgeGeom.id]?.locked) return;
                beginBadgeMove(
                  event,
                  edgeGeom.id,
                  edgeGeom.points,
                  current.t,
                  current.side,
                );
              }}
            >
              <title>Arrow number {edgeModel.step}</title>
              <circle
                className="edge-badge-handle-ring"
                r={15}
              />
              <circle
                className="edge-badge-handle-core"
                r={10}
              />
              <text
                className="edge-badge-handle-text"
                x={0}
                y={0}
                textAnchor="middle"
              >
                {edgeModel.step}
              </text>
            </g>
          </g>
        );
      })()}

      {edgeGeom && showEdgeHandles && view.places[edgeGeom.id]?.visible !== false && (
        <g
          data-route-editor={edgeGeom.id}
          aria-label="Connector route controls"
          className={`route-editor${rewire?.edgeId === edgeGeom.id ? " is-rewiring" : ""}`}
          pointerEvents="all"
        >
          <polyline
            className="route-edit-rail"
            points={edgeGeom.points.map((point) => `${point.x},${point.y}`).join(" ")}
          />

          {edgeGeom.points.map((point, index) => {
            const endpoint = index === 0 || index === edgeGeom.points.length - 1;
            const endpointName = index === 0
              ? "source"
              : index === edgeGeom.points.length - 1
                ? "target"
                : undefined;
            if (endpoint) {
              return (
                <rect
                  key={`${edgeGeom.id}-endpoint-${index}`}
                  data-interactive
                  data-edge-id={edgeGeom.id}
                  data-bend-index={index}
                  data-endpoint={endpointName}
                  data-endpoint-handle={`${edgeGeom.id}:${endpointName}`}
                  aria-label={endpointName === "source" ? "Reconnect source endpoint" : "Reconnect target endpoint"}
                  className={`bend-handle endpoint-handle${rewire?.edgeId === edgeGeom.id && rewire.endpoint === endpointName ? " is-rewiring" : ""}`}
                  x={point.x - 5}
                  y={point.y - 5}
                  width={10}
                  height={10}
                  rx={2}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (view.places[edgeGeom.id]?.locked) return;
                    beginRewire(event, edgeGeom.id, endpointName!);
                  }}
                />
              );
            }

            return (
              <g
                key={`${edgeGeom.id}-bend-${index}`}
                data-interactive
                data-edge-id={edgeGeom.id}
                data-bend-index={index}
                data-bend-handle={`${edgeGeom.id}:${index}`}
                aria-label={`Move turn point ${index}`}
                className="turn-handle"
                pointerEvents="all"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (view.places[edgeGeom.id]?.locked) return;
                  beginPointMove(
                    event,
                    zoom,
                    snapToGrid,
                    edgeGeom.points,
                    index,
                    commitRoute.bind(null, edgeGeom.id),
                    onGestureBegin,
                    onGestureEnd,
                  );
                }}
              >
                <circle className="bend-handle-halo" cx={point.x} cy={point.y} r={10} />
                <circle className="bend-handle" cx={point.x} cy={point.y} r={6} />
                <circle className="bend-handle-core" cx={point.x} cy={point.y} r={2} />
              </g>
            );
          })}

          {showBendHandles && edgeGeom.points.slice(0, -1).map((point, index) => {
            const next = edgeGeom.points[index + 1]!;
            const horizontal = point.y === next.y;
            const segmentLength = Math.abs(next.x - point.x) + Math.abs(next.y - point.y);
            if (segmentLength < 32) return null;
            const centerX = (point.x + next.x) / 2;
            const centerY = (point.y + next.y) / 2;
            return (
              <g
                key={`${edgeGeom.id}-segment-${index}`}
                data-interactive
                data-edge-id={edgeGeom.id}
                data-segment-index={index}
                data-segment-handle={`${edgeGeom.id}:${index}`}
                aria-label={`Move connector segment ${index}`}
                className={`segment-handle-group ${horizontal ? "is-horizontal" : "is-vertical"}`}
                pointerEvents="all"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (view.places[edgeGeom.id]?.locked) return;
                  beginSegmentMove(
                    event,
                    zoom,
                    snapToGrid,
                    edgeGeom.points,
                    index,
                    commitRoute.bind(null, edgeGeom.id),
                    onGestureBegin,
                    onGestureEnd,
                  );
                }}
              >
                <rect
                  className="segment-handle"
                  x={centerX - 8}
                  y={centerY - 8}
                  width={16}
                  height={16}
                  rx={5}
                />
                <line
                  className="segment-handle-glyph"
                  x1={horizontal ? centerX : centerX - 3}
                  y1={horizontal ? centerY - 3 : centerY}
                  x2={horizontal ? centerX : centerX + 3}
                  y2={horizontal ? centerY + 3 : centerY}
                />
              </g>
            );
          })}
        </g>
      )}

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

function nearestEdgeAt(
  point: Point,
  layout: LayoutResult,
  doc: DiagramDocument,
  view: ReturnType<typeof getDefaultView>,
  preferredId?: string,
): SelectionItem | null {
  const visibleEdges = layout.edges.filter((edge) =>
    view.places[edge.id]?.visible !== false &&
    isEntityVisible(doc, view, edge.source) &&
    isEntityVisible(doc, view, edge.target),
  );
  const id = nearestEdgeIdAt(point, visibleEdges, preferredId);
  return id ? { kind: "edge", id } : null;
}

function closestInteractiveTarget(
  point: Point,
  layout: LayoutResult,
  doc: DiagramDocument,
  view: ReturnType<typeof getDefaultView>,
): SelectionItem | null {
  const candidates: Array<{
    item: SelectionItem;
    distance: number;
    priority: number;
  }> = [];

  for (const node of layout.nodes) {
    if (!isEntityVisible(doc, view, node.id)) continue;
    const distance = distanceToRect(point, node.obstacle);
    if (distance <= 16) {
      candidates.push({
        item: { kind: "resource", id: node.id },
        distance,
        priority: 0,
      });
    }
  }

  for (const annotation of doc.annotations) {
    const place = view.annotations?.[annotation.id];
    if (place?.visible === false) continue;
    const rect = {
      x: place?.x ?? 48,
      y: place?.y ?? 48,
      w: place?.w ?? 160,
      h: place?.h ?? 48,
    };
    const distance = distanceToRect(point, rect);
    if (distance <= 16) {
      candidates.push({
        item: { kind: "annotation", id: annotation.id },
        distance,
        priority: 0,
      });
    }
  }

  for (const edge of layout.edges) {
    if (
      view.places[edge.id]?.visible === false ||
      !isEntityVisible(doc, view, edge.source) ||
      !isEntityVisible(doc, view, edge.target)
    ) continue;
    const projection = projectPointToPolyline(point, edge.points);
    if (projection && projection.distance <= 16) {
      candidates.push({
        item: { kind: "edge", id: edge.id },
        distance: projection.distance,
        // A connector is the most specific target when the pointer is on its
        // visible stroke, even if the route crosses the source/target card.
        // Without this, the card's zero interior distance always won and made
        // arrows near icons feel impossible to select precisely.
        priority: projection.distance <= 8 ? -1 : 1,
      });
    }
  }

  for (const group of layout.groups) {
    if (!isEntityVisible(doc, view, group.id)) continue;
    const distance = distanceToRectBorder(point, group.bounds);
    if (distance <= 18) {
      candidates.push({
        item: { kind: "group", id: group.id },
        distance,
        priority: 2,
      });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance || a.priority - b.priority);
  return candidates[0]?.item ?? null;
}

function stableBadgePoint(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function distanceToRect(point: Point, rect: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.w));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.h));
  return Math.hypot(dx, dy);
}

function distanceToRectBorder(point: Point, rect: { x: number; y: number; w: number; h: number }): number {
  const inside =
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h;
  if (inside) {
    return Math.min(
      point.x - rect.x,
      rect.x + rect.w - point.x,
      point.y - rect.y,
      rect.y + rect.h - point.y,
    );
  }
  return distanceToRect(point, rect);
}

function badgeSideAt(point: Point, anchor: Point, tangent: Point): EdgeBadgeSide {
  const normal = Math.abs(tangent.x) >= Math.abs(tangent.y)
    ? { x: 0, y: -1 }
    : { x: -1, y: 0 };
  const dot = (point.x - anchor.x) * normal.x + (point.y - anchor.y) * normal.y;
  return dot >= 0 ? "top" : "bottom";
}

function labelSideAt(point: Point, anchor: Point, tangent: Point): EdgeLabelSide {
  const normal = Math.abs(tangent.x) >= Math.abs(tangent.y)
    ? { x: 0, y: -1 }
    : { x: -1, y: 0 };
  const dot = (point.x - anchor.x) * normal.x + (point.y - anchor.y) * normal.y;
  return dot >= 0 ? "top" : "bottom";
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
  if (item.kind === "edge") {
    return layout.edges.find((candidate) => candidate.id === item.id)?.labelRect ?? null;
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

interface MovePreviewController {
  update: (dx: number, dy: number) => void;
  finish: () => void;
}

function createMovePreview(
  overlay: SVGSVGElement | null,
  doc: DiagramDocument,
  selection: Selection,
): MovePreviewController {
  if (!overlay) return { update: () => {}, finish: () => {} };

  const view = getDefaultView(doc);
  const moving = new Map<string, SelectionItem>();
  const add = (item: SelectionItem) => {
    if (item.kind === "edge") return;
    const locked = item.kind === "annotation"
      ? view.annotations?.[item.id]?.locked
      : view.places[item.id]?.locked;
    if (!locked) moving.set(`${item.kind}:${item.id}`, item);
  };
  const addGroupChildren = (groupId: string) => {
    const group = doc.groups.find((candidate) => candidate.id === groupId);
    for (const childId of group?.children ?? []) {
      const childGroup = doc.groups.find((candidate) => candidate.id === childId);
      if (childGroup) {
        add({ kind: "group", id: childId });
        addGroupChildren(childId);
        continue;
      }
      if (doc.resources.some((candidate) => candidate.id === childId)) {
        add({ kind: "resource", id: childId });
      } else if (doc.annotations.some((candidate) => candidate.id === childId)) {
        add({ kind: "annotation", id: childId });
      }
    }
  };

  for (const item of selection) {
    add(item);
    if (item.kind === "group") addGroupChildren(item.id);
  }

  type Target = {
    element: SVGElement;
    transform: string | null;
    willChange: string;
  };
  let targets: Target[] | null = null;
  const resolveTargets = (): Target[] => {
    const elements = new Set<SVGElement>();
    const resourceIds = new Set(
      [...moving.values()]
        .filter((item) => item.kind === "resource")
        .map((item) => item.id),
    );

    for (const item of moving.values()) {
      const renderedId = item.kind === "resource"
        ? `res-${item.id}`
        : item.kind === "group"
          ? `group-${item.id}`
          : `annotation-${item.id}`;
      const rendered = document.getElementById(renderedId);
      if (rendered instanceof SVGElement) elements.add(rendered);
    }
    for (const edge of doc.edges) {
      if (!resourceIds.has(edge.source) || !resourceIds.has(edge.target)) continue;
      const rendered = document.getElementById(`edge-${edge.id}`);
      if (rendered instanceof SVGElement) elements.add(rendered);
    }

    for (const element of overlay.querySelectorAll<SVGElement>(
      "[data-entity-kind][data-entity-id], [data-hover-kind][data-hover-id], [data-drag-overlay-kind][data-drag-overlay-id], [data-quick-connect]",
    )) {
      const kind = element.getAttribute("data-entity-kind")
        ?? element.getAttribute("data-hover-kind")
        ?? element.getAttribute("data-drag-overlay-kind");
      const id = element.getAttribute("data-entity-id")
        ?? element.getAttribute("data-hover-id")
        ?? element.getAttribute("data-drag-overlay-id")
        ?? element.getAttribute("data-quick-connect");
      if (id && [...moving.values()].some((item) => item.id === id && (!kind || item.kind === kind))) {
        elements.add(element);
      }
    }

    return [...elements].map((element) => ({
      element,
      transform: element.getAttribute("transform"),
      willChange: element.style.willChange,
    }));
  };

  return {
    update: (dx, dy) => {
      targets ??= resolveTargets();
      for (const target of targets) {
        const base = target.transform ? `${target.transform} ` : "";
        target.element.style.willChange = "transform";
        target.element.setAttribute("transform", `${base}translate(${dx} ${dy})`);
      }
    },
    finish: () => {
      for (const target of targets ?? []) {
        if (target.transform === null) target.element.removeAttribute("transform");
        else target.element.setAttribute("transform", target.transform);
        target.element.style.willChange = target.willChange;
      }
      targets = null;
    },
  };
}

function beginMove(
  event: React.PointerEvent<SVGElement>,
  zoom: number,
  snapToGrid: boolean,
  rect: { x: number; y: number },
  onMove: (x: number, y: number, dx: number, dy: number) => void,
  preview: MovePreviewController,
) {
  const start = { x: event.clientX, y: event.clientY };
  const origin = { x: rect.x, y: rect.y };
  let dragging = false;
  let rawDx = 0;
  let rawDy = 0;
  let dx = 0;
  let dy = 0;
  let frame = 0;
  const threshold = 4;

  const move = (next: PointerEvent) => {
    rawDx = (next.clientX - start.x) / zoom;
    rawDy = (next.clientY - start.y) / zoom;
    if (!dragging && Math.hypot(rawDx, rawDy) < threshold) return;
    dragging = true;
    const nextX = snapCoordinate(origin.x + rawDx, snapToGrid);
    const nextY = snapCoordinate(origin.y + rawDy, snapToGrid);
    dx = nextX - origin.x;
    dy = nextY - origin.y;
    if (!frame) {
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        preview.update(rawDx, rawDy);
      });
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    if (!dragging) return;
    if (frame) window.cancelAnimationFrame(frame);
    preview.update(rawDx, rawDy);
    onMove(origin.x + dx, origin.y + dy, dx, dy);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => preview.finish());
    });
  };
  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    if (frame) window.cancelAnimationFrame(frame);
    preview.finish();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
}

function createFramePreview<T>(apply: (value: T) => void) {
  let frame: number | null = null;
  let pending: T | undefined;
  let hasPending = false;

  const flush = () => {
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
    if (!hasPending) return;
    const value = pending as T;
    pending = undefined;
    hasPending = false;
    apply(value);
  };

  return {
    schedule(value: T) {
      pending = value;
      hasPending = true;
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (!hasPending) return;
        const next = pending as T;
        pending = undefined;
        hasPending = false;
        apply(next);
      });
    },
    flush,
  };
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
  snapToGrid: boolean,
  rect: { x: number; y: number; w: number; h: number },
  handle: string,
  onResize: (w: number, h: number) => void,
  onBegin?: () => void,
  onEnd?: () => void,
) {
  onBegin?.();
  const start = { x: event.clientX, y: event.clientY };
  const origin = { ...rect };
  const preview = createFramePreview<{ w: number; h: number }>(({ w, h }) => onResize(w, h));
  const move = (next: PointerEvent) => {
    const dx = (next.clientX - start.x) / zoom;
    const dy = (next.clientY - start.y) / zoom;
    const w = handle.includes("e")
      ? Math.max(32, snapCoordinate(origin.w + dx, snapToGrid))
      : origin.w;
    const h = handle.includes("s")
      ? Math.max(32, snapCoordinate(origin.h + dy, snapToGrid))
      : origin.h;
    preview.schedule({ w, h });
  };
  const up = (next: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    move(next);
    preview.flush();
    onEnd?.();
  };
  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    preview.flush();
    onEnd?.();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
}

function beginSegmentMove(
  event: React.PointerEvent<SVGElement>,
  zoom: number,
  snapToGrid: boolean,
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
  const preview = createFramePreview<Point[]>((next) => onMove(next));
  const move = (next: PointerEvent) => {
    const updated = origin.map((point) => ({ ...point }));
    if (horizontal) {
      const y = snapCoordinate(
        origin[index]!.y + (next.clientY - start.y) / zoom,
        snapToGrid,
      );
      updated[index]!.y = y;
      updated[index + 1]!.y = y;
    } else {
      const x = snapCoordinate(
        origin[index]!.x + (next.clientX - start.x) / zoom,
        snapToGrid,
      );
      updated[index]!.x = x;
      updated[index + 1]!.x = x;
    }
    preview.schedule(normalizeOrthogonalRoute(updated));
  };
  const up = (next: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    move(next);
    preview.flush();
    onEnd?.();
  };
  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    preview.flush();
    onEnd?.();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
}

function beginPointMove(
  event: React.PointerEvent<SVGElement>,
  zoom: number,
  snapToGrid: boolean,
  points: Point[],
  index: number,
  onMove: (points: Point[]) => void,
  onBegin?: () => void,
  onEnd?: () => void,
) {
  onBegin?.();
  const start = { x: event.clientX, y: event.clientY };
  const origin = points.map((point) => ({ ...point }));
  const preview = createFramePreview<Point[]>((next) => onMove(next));
  const move = (next: PointerEvent) => {
    const target = {
      x: snapCoordinate(
        origin[index]!.x + (next.clientX - start.x) / zoom,
        snapToGrid,
      ),
      y: snapCoordinate(
        origin[index]!.y + (next.clientY - start.y) / zoom,
        snapToGrid,
      ),
    };
    preview.schedule(moveOrthogonalBend(origin, index, target));
  };
  const up = (next: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    move(next);
    preview.flush();
    onEnd?.();
  };
  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    preview.flush();
    onEnd?.();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
}

function portPoints(rect: { x: number; y: number; w: number; h: number }) {
  return portAnchors(rect);
}

function portAt(clientX: number, clientY: number): RewireTarget | null {
  const target = document.elementFromPoint(clientX, clientY)?.closest<SVGElement>(
    "[data-node-id][data-port-side][data-port-offset]",
  ) ?? null;
  return readPortTarget(target);
}

function readPortTarget(element: Element | null): RewireTarget | null {
  const nodeId = element?.getAttribute("data-node-id");
  const side = element?.getAttribute("data-port-side") as Side | null;
  const offsetValue = Number(element?.getAttribute("data-port-offset"));
  if (!nodeId || !side || !Number.isFinite(offsetValue)) return null;
  if (side !== "n" && side !== "s" && side !== "e" && side !== "w") return null;
  return { nodeId, side, offset: normalizePortOffset(offsetValue) };
}

function pointFromClient(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
  zoom: number,
): Point {
  const rect = svg?.getBoundingClientRect();
  if (!rect) return { x: clientX, y: clientY };
  const viewBox = svg?.viewBox.baseVal;
  const width = viewBox?.width || Number(svg?.getAttribute("width")) || rect.width / zoom;
  const height = viewBox?.height || Number(svg?.getAttribute("height")) || rect.height / zoom;
  return {
    x: ((clientX - rect.left) / rect.width) * width,
    y: ((clientY - rect.top) / rect.height) * height,
  };
}

function rectFromPoints(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}
