import type {
  DiagramDocument,
  EdgeBadgeSide,
  EdgeLabelSide,
  EdgeKind,
  EdgeStyle,
  LayoutResult,
  Point,
  Side,
} from "@dumb-diagrams/runtime/core";
import {
  getDefaultView,
  normalizePortOffset,
  portPoint,
  portAnchors,
} from "@dumb-diagrams/runtime/core";
import {
  getEdgeBadgePlacement,
  getEdgeLabelPlacementOnPath,
  normalizeOrthogonalRoute,
  projectPointToPolyline,
  routeConnectionPreview,
  routeEdgePreview,
} from "@dumb-diagrams/runtime/route";
import { memo, useEffect, useMemo, useRef, useState } from "react";

import {
  isSelected,
  type Selection,
  type SelectionItem,
} from "../editor-model";
import {
  snapCoordinate,
  snapDragDelta,
  type AlignmentGuide,
} from "../grid.js";
import { nearestEdgeIdAt, nearestNodePortAt } from "./edge-targeting.js";
import {
  anchorOrthogonalRouteEndpoints,
  moveOrthogonalBend,
} from "./route-editing.js";
import {
  distanceToResource,
  pointInRect,
  resourceHitRects,
  resourceVisualBounds,
} from "./selection-targeting.js";
import {
  createInteractionIndex,
  isEntityVisible,
  type InteractionCandidates,
} from "./interaction-index.js";

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

function InteractionOverlayComponent({
  doc,
  layout,
  tool,
  zoom,
  snapToGrid,
  selection,
  pendingPort,
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
  const view = useMemo(() => getDefaultView(doc), [doc]);
  const canvas = layout.canvasBounds ?? {
    x: 0,
    y: 0,
    w: layout.width,
    h: layout.height,
  };
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
  const [routeEditPreview, setRouteEditPreview] = useState<{
    edgeId: string;
    points: Point[];
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    kind: SelectionItem["kind"];
    id: string;
    bounds: { x: number; y: number; w: number; h: number };
  } | null>(null);
  const labelDragRef = useRef<LabelDrag>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const pendingHoverRef = useRef<{
    clientX: number;
    clientY: number;
    svg: SVGSVGElement | null;
    fallback: SelectionItem;
    edgeLabel: boolean;
  } | null>(null);

  useEffect(() => {
    setRouteEditPreview(null);
    setResizePreview(null);
    setBadgeDrag(null);
  }, [layout]);

  useEffect(() => () => {
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current);
    }
  }, []);

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
  const interactionIndex = useMemo(
    () => createInteractionIndex(layout, doc, view),
    [doc, layout, view],
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
  const editableEdgePoints = edgeGeom && routeEditPreview?.edgeId === edgeGeom.id
    ? routeEditPreview.points
    : edgeGeom?.points;

  const commitRoute = (edgeId: string, points: Point[]) => {
    const edge = doc.edges.find((candidate) => candidate.id === edgeId);
    const source = edge ? layout.nodes.find((node) => node.id === edge.source) : undefined;
    const target = edge ? layout.nodes.find((node) => node.id === edge.target) : undefined;
    const anchored = source && target
      ? anchorOrthogonalRouteEndpoints(points, source.icon, target.icon)
      : points;
    onRoute(edgeId, normalizeOrthogonalRoute(anchored));
  };

  const closestTargetAt = (
    clientX: number,
    clientY: number,
    svg = document.querySelector<SVGSVGElement>('[data-testid="canvas-interaction-overlay"]'),
  ): SelectionItem | null => {
    const point = pointFromClient(
      svg,
      clientX,
      clientY,
      zoom,
    );
    return closestInteractiveTarget(point, layout, doc, view, interactionIndex.at(point));
  };

  const resolveHoverTarget = (
    pending: NonNullable<typeof pendingHoverRef.current>,
  ): SelectionItem | null => {
    const { clientX, clientY, svg, fallback, edgeLabel } = pending;
    const target = closestTargetAt(
      clientX,
      clientY,
      svg,
    );
    if (fallback.kind !== "edge" || edgeLabel) {
      return target ?? fallback;
    }

    // Transparent connector hit strokes can overlap. Resolve only among
    // nearby edges using the same SVG that received the event, with the
    // browser-hit edge as the tie-breaker for coincident routes.
    return target?.kind === "edge"
      ? nearestEdgeAt(
          pointFromClient(
            svg,
            clientX,
            clientY,
            zoom,
          ),
          layout,
          doc,
          view,
          fallback.id,
          interactionIndex.at(pointFromClient(svg, clientX, clientY, zoom)).edges,
        ) ?? fallback
      : target ?? fallback;
  };

  const updateHover = (event: React.PointerEvent<SVGElement>) => {
    if (tool !== "select") return;
    const badgeId = event.currentTarget.getAttribute("data-edge-badge-hit")
      ?? event.currentTarget.getAttribute("data-edge-badge");
    const kind = (event.currentTarget.getAttribute("data-entity-kind")
      ?? (badgeId ? "edge" : null)) as SelectionItem["kind"] | null;
    const id = event.currentTarget.getAttribute("data-entity-id") ?? badgeId;
    if (!kind || !id) return;
    pendingHoverRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      svg: event.currentTarget.ownerSVGElement,
      fallback: { kind, id },
      edgeLabel: event.currentTarget.hasAttribute("data-edge-label-hit"),
    };
    if (hoverFrameRef.current !== null) return;
    hoverFrameRef.current = window.requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      const pending = pendingHoverRef.current;
      pendingHoverRef.current = null;
      if (!pending) return;
      const next = resolveHoverTarget(pending);
      setHoveredItem((current) =>
        current?.kind === next?.kind && current?.id === next?.id ? current : next
      );
    });
  };

  const highlightEdge = (edgeId: string) => {
    if (tool !== "select") return;
    pendingHoverRef.current = null;
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }
    setHoveredItem((current) =>
      current?.kind === "edge" && current.id === edgeId
        ? current
        : { kind: "edge", id: edgeId },
    );
  };

  const clearHover = (kind: SelectionItem["kind"], id: string) => {
    pendingHoverRef.current = null;
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }
    setHoveredItem((current) =>
      current?.kind === kind && current.id === id ? null : current,
    );
  };

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
      const changed = Boolean(next && (lastT !== initialT || lastSide !== initialSide));
      if (changed) {
        onBadgeMove(edgeId, lastT, lastSide);
      }
      // Keep the committed preview visible until the worker returns the new
      // layout, avoiding a one-frame snap back to the old badge position.
      if (!changed) setBadgeDrag(null);
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
    initialPoint: Point,
    initialRect: { x: number; y: number; w: number; h: number },
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

    const applyPlacement = (placement: { point: Point; rect: typeof initialRect } | undefined) => {
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

    const restoreInitialPlacement = () => applyPlacement({
      point: initialPoint,
      rect: initialRect,
    });

    handle.setPointerCapture(pointerId);
    onGestureBegin();
    setHoveredItem(null);
    labelDragRef.current = { edgeId, t: initialT, side: initialSide };

    const move = (next: PointerEvent) => {
      if (!didDrag && Math.hypot(next.clientX - dragStart.x, next.clientY - dragStart.y) < 3) return;
      didDrag = true;
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
      if (next && didDrag) move(next);
      const final = labelDragRef.current;
      if (next && didDrag && final && (final.t !== initialT || final.side !== initialSide)) {
        onLabelMove(final.edgeId, final.t, final.side);
      } else if (!next && didDrag) {
        restoreInitialPlacement();
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

  const beginGroupMove = (
    event: React.PointerEvent<SVGElement>,
    targetId: string,
  ) => {
    if (tool !== "select") return;
    const target = { kind: "group" as const, id: targetId };
    const targetGroup = layout.groups.find((candidate) => candidate.id === target.id);
    const targetPlace = targetGroup ? view.places[targetGroup.id] : undefined;
    if (!targetGroup || targetPlace?.locked) return;
    const active = selection.some(
      (candidate) => candidate.kind === target.kind && candidate.id === target.id,
    ) ? selection : [target];
    beginMove(
      event,
      zoom,
      snapToGrid,
      targetGroup.bounds,
      (x, y, dx, dy) => onMove("group", target.id, x, y, dx, dy),
      createMovePreview(event.currentTarget.ownerSVGElement, doc, active),
      alignmentTargets(layout, doc, active),
      createAlignmentGuidePreview(event.currentTarget.ownerSVGElement),
    );
  };

  return (
    <svg
      className={`interaction-overlay${tool === "select" ? " is-select-tool" : ""}${tool === "text" ? " is-text-tool" : ""}${hoveredItem?.kind === "group" ? " has-group-hover" : ""}`}
      data-testid="canvas-interaction-overlay"
      width={canvas.w}
      height={canvas.h}
      viewBox={`${canvas.x} ${canvas.y} ${canvas.w} ${canvas.h}`}
      aria-label="Diagram editing layer"
      onPointerDown={(event) => {
        if (tool !== "select" || event.button !== 0) return;
        if ((event.target as Element).closest("[data-interactive]")) return;
        const overlay = event.currentTarget as SVGSVGElement;
        const toSvg = (clientX: number, clientY: number): Point =>
          pointFromClient(overlay, clientX, clientY, zoom);
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
        if ((event.target as Element).closest("[data-interactive]")) return;
        // CanvasStage owns empty-space menus so right-click also works beyond
        // the artboard and retains the exact clicked world coordinate.
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
      <g data-alignment-guides />
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
              if (target.kind === "group") beginGroupMove(event, target.id);
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
            const overlapTarget = closestInteractiveTarget(
              point,
              layout,
              doc,
              view,
              interactionIndex.at(point),
            );
            const target = overlapTarget?.kind === "group"
              ? overlapTarget
              : nearestEdgeAt(point, layout, doc, view, edge.id) ?? { kind: "edge" as const, id: edge.id };
            onSelect(target, event.shiftKey);
            if (target.kind === "group") beginGroupMove(event, target.id);
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
        const hitRects = resourceHitRects(node);
        const onNodePointerDown = (event: React.PointerEvent<SVGRectElement>) => {
          event.stopPropagation();
          const target = closestTargetAt(event.clientX, event.clientY)
            ?? { kind: "resource" as const, id: node.id };
          onSelect(target, event.shiftKey);
          if (tool === "select" && target.kind === "resource") {
            const targetNode = layout.nodes.find((candidate) => candidate.id === target.id);
            const targetPlace = targetNode ? view.places[targetNode.id] : undefined;
            if (!targetNode || targetPlace?.locked) return;
            const active = selection.some(
              (candidate) => candidate.kind === target.kind && candidate.id === target.id,
            ) ? selection : [target];
            beginMove(
              event,
              zoom,
              snapToGrid,
              { ...targetNode.icon },
              (x, y, dx, dy) => onMove("resource", target.id, x, y, dx, dy),
              createMovePreview(event.currentTarget.ownerSVGElement, doc, active),
              alignmentTargets(layout, doc, active),
              createAlignmentGuidePreview(event.currentTarget.ownerSVGElement),
            );
          }
        };
        const onNodeContextMenu = (event: React.MouseEvent<SVGRectElement>) => {
          event.preventDefault();
          event.stopPropagation();
          onContextMenu(
            event.clientX,
            event.clientY,
            closestTargetAt(event.clientX, event.clientY) ?? { kind: "resource", id: node.id },
          );
        };
        return hitRects.map((rect, index) => (
          <rect
            key={`${node.id}-${index === 0 ? "icon" : "label"}`}
            data-interactive
            data-entity-kind={index === 0 ? "resource" : undefined}
            data-entity-id={index === 0 ? node.id : undefined}
            data-node-id={index === 0 ? node.id : undefined}
            data-resource-hit-part={index === 0 ? "icon" : "label"}
            aria-selected={index === 0 ? isSelected(selection, "resource", node.id) : undefined}
            aria-label={index === 0 ? `Resource ${node.serviceLabel}` : undefined}
            aria-hidden={index === 1 ? true : undefined}
            className={`hit-node hit-node-${index === 0 ? "icon" : "label"}${isSelected(selection, "resource", node.id) ? " is-selected" : ""}`}
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            onPointerEnter={updateHover}
            onPointerMove={updateHover}
            onPointerLeave={() => clearHover("resource", node.id)}
            onPointerDown={onNodePointerDown}
            onContextMenu={onNodeContextMenu}
          />
        ));
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
            data-hit-annotation-style={annotation.style ?? "paper"}
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
                  alignmentTargets(layout, doc, active),
                  createAlignmentGuidePreview(event.currentTarget.ownerSVGElement),
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

      {/* Connector labels intentionally sit above broad node/group targets. */}
      {edges.map((edge) => {
        if (
          !edge.label ||
          !edge.labelRect ||
          view.places[edge.id]?.visible === false ||
          !isEntityVisible(doc, view, edge.source) ||
          !isEntityVisible(doc, view, edge.target)
        ) return null;
        const rect = edge.labelRect;
        const label = edge.label;
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
            aria-label={`Connector label ${label}`}
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
                  label,
                  labelT,
                  labelSide,
                  edge.labelPoint ?? { x: rect.x + rect.w / 2, y: rect.y + 11 },
                  rect,
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
            {hoveredEdge.badge && (
              <circle
                data-hover-kind="edge-badge"
                data-hover-id={hoveredItem.id}
                className="hover-edge-badge"
                cx={stableBadgePoint(hoveredEdge.badge).x}
                cy={stableBadgePoint(hoveredEdge.badge).y}
                r={15}
              />
            )}
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
        const bounds = resizePreview?.kind === item.kind && resizePreview.id === item.id
          ? resizePreview.bounds
          : boundsFor(item, layout, doc);
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
        const bounds = resizePreview?.kind === item.kind && resizePreview.id === item.id
          ? resizePreview.bounds
          : boundsFor(item, layout, doc);
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
                    (w, h) => setResizePreview({
                      kind: item.kind,
                      id: item.id,
                      bounds: { ...bounds, w, h },
                    }),
                    (w, h) => onResize(
                        item.kind as "resource" | "group" | "annotation",
                        item.id,
                        w,
                        h,
                        event.shiftKey,
                      ),
                    () => setResizePreview(null),
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

      {edges.map((edge) => {
        if (
          edge.step === undefined ||
          !edge.badge ||
          view.places[edge.id]?.visible === false ||
          !isEntityVisible(doc, view, edge.source) ||
          !isEntityVisible(doc, view, edge.target)
        ) return null;
        const point = stableBadgePoint(edge.badge);
        return (
          <g
            key={`${edge.id}-badge-hit`}
            data-interactive
            data-edge-badge-hit={edge.id}
            data-edge-id={edge.id}
            aria-label={`Select connector ${edge.id} via number ${edge.step}`}
            className="edge-badge-hit"
            transform={`translate(${point.x} ${point.y})`}
            onPointerEnter={() => highlightEdge(edge.id)}
            onPointerMove={() => highlightEdge(edge.id)}
            onPointerLeave={() => clearHover("edge", edge.id)}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelect({ kind: "edge", id: edge.id }, event.shiftKey);
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenu(event.clientX, event.clientY, { kind: "edge", id: edge.id });
            }}
          >
            <circle r={15} />
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
              onPointerEnter={() => highlightEdge(edgeGeom.id)}
              onPointerMove={() => highlightEdge(edgeGeom.id)}
              onPointerLeave={() => clearHover("edge", edgeGeom.id)}
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
            points={editableEdgePoints!.map((point) => `${point.x},${point.y}`).join(" ")}
          />

          {editableEdgePoints!.map((point, index) => {
            const endpoint = index === 0 || index === editableEdgePoints!.length - 1;
            const endpointName = index === 0
              ? "source"
              : index === editableEdgePoints!.length - 1
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
                    editableEdgePoints!,
                    index,
                    (points) => setRouteEditPreview({ edgeId: edgeGeom.id, points }),
                    commitRoute.bind(null, edgeGeom.id),
                    () => setRouteEditPreview(null),
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

          {showBendHandles && editableEdgePoints!.slice(0, -1).map((point, index) => {
            const next = editableEdgePoints![index + 1]!;
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
                    editableEdgePoints!,
                    index,
                    (points) => setRouteEditPreview({ edgeId: edgeGeom.id, points }),
                    commitRoute.bind(null, edgeGeom.id),
                    () => setRouteEditPreview(null),
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

export const InteractionOverlay = memo(
  InteractionOverlayComponent,
  (previous, next) =>
    previous.doc === next.doc &&
    previous.layout === next.layout &&
    previous.tool === next.tool &&
    previous.zoom === next.zoom &&
    previous.snapToGrid === next.snapToGrid &&
    previous.selection === next.selection &&
    previous.pendingPort === next.pendingPort,
);

function nearestEdgeAt(
  point: Point,
  layout: LayoutResult,
  doc: DiagramDocument,
  view: ReturnType<typeof getDefaultView>,
  preferredId?: string,
  candidates: LayoutResult["edges"] = layout.edges,
): SelectionItem | null {
  const visibleEdges = candidates.filter((edge) =>
    view.places[edge.id]?.visible !== false &&
    isEntityVisible(doc, view, edge.source) &&
    isEntityVisible(doc, view, edge.target),
  );
  const id = nearestEdgeIdAt(point, visibleEdges, preferredId);
  return id ? { kind: "edge", id } : null;
}

export function closestInteractiveTarget(
  point: Point,
  layout: LayoutResult,
  doc: DiagramDocument,
  view: ReturnType<typeof getDefaultView>,
  pool: InteractionCandidates = {
    nodes: layout.nodes,
    edges: layout.edges,
    groups: layout.groups,
    annotations: doc.annotations,
  },
): SelectionItem | null {
  const candidates: Array<{
    item: SelectionItem;
    distance: number;
    priority: number;
  }> = [];

  // Labels are small, explicit targets and may legitimately overlap the
  // routing footprint of a resource. They always win inside their visible box.
  for (const edge of pool.edges) {
    if (
      edge.labelRect &&
      pointInRect(point, edge.labelRect) &&
      view.places[edge.id]?.visible !== false &&
      isEntityVisible(doc, view, edge.source) &&
      isEntityVisible(doc, view, edge.target)
    ) {
      return { kind: "edge", id: edge.id };
    }
  }

  for (const node of pool.nodes) {
    if (!isEntityVisible(doc, view, node.id)) continue;
    const distance = distanceToResource(point, node);
    if (distance <= 6) {
      candidates.push({
        item: { kind: "resource", id: node.id },
        distance,
        // A connector endpoint can sit directly on top of a resource card.
        // Keep the card draggable from its own interior; connectors still win
        // in the surrounding hit slop where their visible stroke is specific.
        priority: distance === 0 ? -2 : 0,
      });
    }
  }

  for (const annotation of pool.annotations) {
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
        priority: distance === 0 ? -2 : 0,
      });
    }
  }

  for (const edge of pool.edges) {
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
        // A connector is the most specific target on its visible stroke unless
        // the pointer is inside a resource or annotation card. This keeps
        // arrows precise without making connected items feel locked in place.
        priority: projection.distance <= 8 ? -1 : 1,
      });
    }
  }

  for (const group of pool.groups) {
    if (!isEntityVisible(doc, view, group.id)) continue;
    const distance = distanceToRectBorder(point, group.bounds);
    if (distance <= 18) {
      candidates.push({
        item: { kind: "group", id: group.id },
        distance,
        // The visible boundary is the user's move handle. When a connector is
        // routed directly along it, the boundary must remain draggable instead
        // of becoming unreachable behind the widened connector hit stroke.
        priority: -2,
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
    const borderDistance = Math.min(
      point.x - rect.x,
      rect.x + rect.w - point.x,
      point.y - rect.y,
      rect.y + rect.h - point.y,
    );
    // Client-to-SVG conversion can leave an exact border hit a few floating
    // point ulps inside the group. Treat that as the same zero-distance
    // boundary hit as the corresponding connector, so the boundary priority
    // remains deterministic at crossings.
    return borderDistance <= 1e-6 ? 0 : borderDistance;
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
    return node ? resourceVisualBounds(node) : null;
  }
  if (item.kind === "group") {
    const group = layout.groups.find((candidate) => candidate.id === item.id);
    return group?.bounds ?? null;
  }
  if (item.kind === "annotation") {
    if (!doc.annotations.some((candidate) => candidate.id === item.id)) return null;
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

/** Alignment follows the boxes people perceive: resource icons rather than
 * their variable-width label/routing obstacles, and visual container bounds. */
function alignmentTargets(
  layout: LayoutResult,
  doc: DiagramDocument,
  moving: Selection,
): Array<{ x: number; y: number; w: number; h: number }> {
  const excluded = new Set(moving.map((item) => item.id));
  const excludeChildren = (groupId: string) => {
    const group = doc.groups.find((candidate) => candidate.id === groupId);
    for (const childId of group?.children ?? []) {
      if (excluded.has(childId)) continue;
      excluded.add(childId);
      if (doc.groups.some((candidate) => candidate.id === childId)) excludeChildren(childId);
    }
    for (const child of group?.borderChildren ?? []) excluded.add(child.id);
  };
  for (const item of moving) {
    if (item.kind === "group") excludeChildren(item.id);
  }

  const view = getDefaultView(doc);
  return [
    ...layout.groups
      .filter((group) => !excluded.has(group.id) && isEntityVisible(doc, view, group.id))
      .map((group) => group.bounds),
    ...layout.nodes
      .filter((node) => !excluded.has(node.id) && isEntityVisible(doc, view, node.id))
      .map((node) => node.icon),
    ...doc.annotations.flatMap((annotation) => {
      if (excluded.has(annotation.id)) return [];
      const place = view.annotations?.[annotation.id];
      if (place?.visible === false) return [];
      return [{
        x: place?.x ?? 48,
        y: place?.y ?? 48,
        w: place?.w ?? 160,
        h: place?.h ?? 48,
      }];
    }),
  ];
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
  commit: () => void;
  finish: () => void;
}

interface AlignmentGuidePreviewController {
  update: (guides: AlignmentGuide[]) => void;
  finish: () => void;
}

function createAlignmentGuidePreview(
  overlay: SVGSVGElement | null,
): AlignmentGuidePreviewController {
  const layer = overlay?.querySelector<SVGGElement>("[data-alignment-guides]") ?? null;
  const clear = () => layer?.replaceChildren();
  return {
    update: (guides) => {
      if (!layer) return;
      clear();
      for (const guide of guides) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("data-alignment-guide", guide.axis);
        line.setAttribute("data-alignment-anchor", guide.anchor);
        line.setAttribute("class", `alignment-guide is-${guide.anchor}`);
        line.setAttribute("x1", String(guide.axis === "x" ? guide.position : guide.from - 12));
        line.setAttribute("y1", String(guide.axis === "x" ? guide.from - 12 : guide.position));
        line.setAttribute("x2", String(guide.axis === "x" ? guide.position : guide.to + 12));
        line.setAttribute("y2", String(guide.axis === "x" ? guide.to + 12 : guide.position));
        layer.append(line);
      }
    },
    finish: clear,
  };
}

function createMovePreview(
  overlay: SVGSVGElement | null,
  doc: DiagramDocument,
  selection: Selection,
): MovePreviewController {
  if (!overlay) return { update: () => {}, commit: () => {}, finish: () => {} };

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
  let settleFrame: number | null = null;
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

  const finish = () => {
    if (settleFrame !== null) window.cancelAnimationFrame(settleFrame);
    settleFrame = null;
    for (const target of targets ?? []) {
      if (target.transform === null) target.element.removeAttribute("transform");
      else target.element.setAttribute("transform", target.transform);
      target.element.style.willChange = target.willChange;
    }
    targets = null;
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
    commit: () => {
      const renderedTargets = (targets ?? [])
        .map((target) => target.element)
        .filter((element) => element.closest(".diagram-svg"));
      if (!renderedTargets.length) {
        finish();
        return;
      }
      // A cold worker has to load the compiler/catalog chunks before its first
      // route. Keep the optimistic position through that startup (and through
      // unusually complex routes) without ever blocking the pointer-up frame.
      const deadline = Date.now() + 15_000;
      const settle = () => {
        settleFrame = null;
        // dangerouslySetInnerHTML replaces the rendered SVG descendants when
        // the worker result lands. Keep the preview attached until then so
        // there is no flash back to the pre-drag position.
        if (renderedTargets.some((element) => !element.isConnected) || Date.now() >= deadline) {
          finish();
          return;
        }
        settleFrame = window.requestAnimationFrame(settle);
      };
      settleFrame = window.requestAnimationFrame(settle);
    },
    finish,
  };
}

function beginMove(
  event: React.PointerEvent<SVGElement>,
  zoom: number,
  snapToGrid: boolean,
  rect: { x: number; y: number; w: number; h: number },
  onMove: (x: number, y: number, dx: number, dy: number) => void,
  preview: MovePreviewController,
  targets: Array<{ x: number; y: number; w: number; h: number }>,
  guidePreview: AlignmentGuidePreviewController,
) {
  const start = { x: event.clientX, y: event.clientY };
  const origin = { x: rect.x, y: rect.y };
  let dragging = false;
  let rawDx = 0;
  let rawDy = 0;
  let dx = 0;
  let dy = 0;
  let previewDx = 0;
  let previewDy = 0;
  let guides: AlignmentGuide[] = [];
  let frame = 0;
  const thresholdPx = 3;

  const move = (next: PointerEvent) => {
    rawDx = (next.clientX - start.x) / zoom;
    rawDy = (next.clientY - start.y) / zoom;
    if (Math.hypot(next.clientX - start.x, next.clientY - start.y) >= thresholdPx) {
      dragging = true;
    }
    const snapped = snapDragDelta(rect, targets, rawDx, rawDy, snapToGrid, zoom);
    dx = snapped.dx;
    dy = snapped.dy;
    guides = snapped.guides;
    // Grid quantisation is committed on release, while peer alignment is a
    // gentle magnetic constraint during the gesture. This preserves smooth
    // pixel-level tracking without allowing an aligned drop to drift.
    previewDx = guides.some((guide) => guide.axis === "x") ? dx : rawDx;
    previewDy = guides.some((guide) => guide.axis === "y") ? dy : rawDy;
    if (!frame) {
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        preview.update(previewDx, previewDy);
        guidePreview.update(guides);
      });
    }
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    if (frame) window.cancelAnimationFrame(frame);
    guidePreview.finish();
    if (!dragging) {
      preview.finish();
      return;
    }
    preview.update(dx, dy);
    onMove(origin.x + dx, origin.y + dy, dx, dy);
    preview.commit();
  };
  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    if (frame) window.cancelAnimationFrame(frame);
    guidePreview.finish();
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

function beginResize(
  event: React.PointerEvent<SVGElement>,
  zoom: number,
  snapToGrid: boolean,
  rect: { x: number; y: number; w: number; h: number },
  handle: string,
  onPreview: (w: number, h: number) => void,
  onCommit: (w: number, h: number) => void,
  onCancel: () => void,
  onBegin?: () => void,
  onEnd?: () => void,
) {
  onBegin?.();
  const start = { x: event.clientX, y: event.clientY };
  const origin = { ...rect };
  let latest = { w: origin.w, h: origin.h };
  const preview = createFramePreview<{ w: number; h: number }>(
    ({ w, h }) => onPreview(w, h),
  );
  const move = (next: PointerEvent) => {
    const dx = (next.clientX - start.x) / zoom;
    const dy = (next.clientY - start.y) / zoom;
    const w = handle.includes("e")
      ? Math.max(32, snapCoordinate(origin.w + dx, snapToGrid))
      : origin.w;
    const h = handle.includes("s")
      ? Math.max(32, snapCoordinate(origin.h + dy, snapToGrid))
      : origin.h;
    latest = { w, h };
    preview.schedule(latest);
  };
  const up = (next: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    move(next);
    preview.flush();
    onCommit(latest.w, latest.h);
    onEnd?.();
  };
  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    preview.flush();
    onCancel();
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
  onPreview: (points: Point[]) => void,
  onCommit: (points: Point[]) => void,
  onCancel: () => void,
  onBegin?: () => void,
  onEnd?: () => void,
) {
  onBegin?.();
  const start = { x: event.clientX, y: event.clientY };
  const origin = points.map((point) => ({ ...point }));
  let latest = origin;
  const horizontal = origin[index]!.y === origin[index + 1]!.y;
  const preview = createFramePreview<Point[]>((next) => onPreview(next));
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
    latest = normalizeOrthogonalRoute(updated);
    preview.schedule(latest);
  };
  const up = (next: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    move(next);
    preview.flush();
    onCommit(latest);
    onEnd?.();
  };
  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    preview.flush();
    onCancel();
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
  onPreview: (points: Point[]) => void,
  onCommit: (points: Point[]) => void,
  onCancel: () => void,
  onBegin?: () => void,
  onEnd?: () => void,
) {
  onBegin?.();
  const start = { x: event.clientX, y: event.clientY };
  const origin = points.map((point) => ({ ...point }));
  let latest = origin;
  const preview = createFramePreview<Point[]>((next) => onPreview(next));
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
    latest = moveOrthogonalBend(origin, index, target);
    preview.schedule(latest);
  };
  const up = (next: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    move(next);
    preview.flush();
    onCommit(latest);
    onEnd?.();
  };
  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    preview.flush();
    onCancel();
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
    x: (viewBox?.x ?? 0) + ((clientX - rect.left) / rect.width) * width,
    y: (viewBox?.y ?? 0) + ((clientY - rect.top) / rect.height) * height,
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
