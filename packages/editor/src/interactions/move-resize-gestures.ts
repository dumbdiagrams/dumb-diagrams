import type { DiagramDocument, Rect } from "@dumb-diagrams/runtime/core";
import { getDefaultView } from "@dumb-diagrams/runtime/core";
import type { PointerEvent as ReactPointerEvent } from "react";

import type { Selection, SelectionItem } from "../model/types";
import {
  snapCoordinate,
  snapDragDelta,
  type AlignmentGuide,
} from "../grid.js";
import {
  createFramePreview,
  startOverlayPointerGesture,
  type OverlayPointerGesture,
} from "./overlay-gestures.js";

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type StartOverlayGesture = (
  event: ReactPointerEvent<SVGElement>,
  options: Omit<Parameters<typeof startOverlayPointerGesture>[0], "event">,
) => OverlayPointerGesture;

export interface MovePreviewController {
  update: (dx: number, dy: number) => void;
  commit: () => void;
  finish: () => void;
}

export interface AlignmentGuidePreviewController {
  update: (guides: AlignmentGuide[]) => void;
  finish: () => void;
}

export function createAlignmentGuidePreview(
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

export function createMovePreview(
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
      // Keep the optimistic transform until the compiled SVG replaces the
      // rendered descendants, avoiding a flash back to the old position.
      const deadline = Date.now() + 15_000;
      const settle = () => {
        settleFrame = null;
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

type GestureCompletion = {
  onGestureEnd: () => void;
  onGestureCancel?: () => void;
};

function safelyCancel(
  complete: GestureCompletion,
  rollback: () => void,
): void {
  let failure: unknown;
  let didFail = false;
  try {
    rollback();
  } catch (error) {
    failure = error;
    didFail = true;
  }
  try {
    complete.onGestureCancel?.();
  } catch (error) {
    if (!didFail) failure = error;
    didFail = true;
  }
  if (didFail) throw failure;
}

export function beginMove(
  event: ReactPointerEvent<SVGElement>,
  zoom: number,
  snapToGrid: boolean,
  rect: Rect,
  onMove: (x: number, y: number, dx: number, dy: number) => boolean | undefined,
  preview: MovePreviewController,
  targets: Array<{ x: number; y: number; w: number; h: number }>,
  guidePreview: AlignmentGuidePreviewController,
  startGesture: StartOverlayGesture,
  onGestureBegin: () => void,
  onGestureEnd: () => void,
  onGestureCancel?: () => void,
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
  let completed = false;
  const thresholdPx = 3;
  const completion = { onGestureEnd, onGestureCancel };

  const stopFrame = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  };
  const cancel = () => {
    if (completed) return;
    completed = true;
    stopFrame();
    safelyCancel(completion, () => {
      let failure: unknown;
      try {
        guidePreview.finish();
      } catch (error) {
        failure = error;
      }
      try {
        preview.finish();
      } catch (error) {
        failure ??= error;
      }
      if (failure) throw failure;
    });
  };
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
    // Grid quantisation is committed on release, while peer alignment remains
    // a gentle magnetic constraint during the gesture.
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
  const up = (next: PointerEvent) => {
    if (completed) return;
    try {
      // Sample pointerup itself so a release without a preceding pointermove
      // commits the position represented by the cursor.
      move(next);
      stopFrame();
      guidePreview.finish();
      if (!dragging) {
        preview.finish();
        completed = true;
        onGestureEnd();
        return;
      }
      preview.update(dx, dy);
      const result = onMove(origin.x + dx, origin.y + dy, dx, dy);
      if (result === false) {
        cancel();
        return;
      }
    } catch (error) {
      if (!completed) {
        try {
          cancel();
        } catch {
          // Preserve the original failure while still attempting rollback.
        }
      }
      throw error;
    }
    let previewFailure: unknown;
    try {
      preview.commit();
    } catch (error) {
      previewFailure = error;
      try {
        preview.finish();
      } catch {
        // Preserve the first visual failure while still attempting cleanup.
      }
    }
    completed = true;
    let endFailure: unknown;
    try {
      onGestureEnd();
    } catch (error) {
      endFailure = error;
    }
    if (previewFailure) throw previewFailure;
    if (endFailure) throw endFailure;
  };
  onGestureBegin();
  try {
    startGesture(event, {
      onMove: move,
      onUp: up,
      onCancel: cancel,
      onCleanup: stopFrame,
      onDispose: cancel,
    });
  } catch (error) {
    try {
      cancel();
    } catch {
      // Preserve the start failure while still attempting rollback.
    }
    throw error;
  }
}

/** Calculate a resized rectangle while preserving the opposite edge. */
export function resizeRect(
  origin: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minimum: number | { w: number; h: number } = 32,
  snap = false,
): Rect {
  const minW = typeof minimum === "number" ? minimum : minimum.w;
  const minH = typeof minimum === "number" ? minimum : minimum.h;
  const leftEdge = origin.x;
  const rightEdge = origin.x + origin.w;
  const topEdge = origin.y;
  const bottomEdge = origin.y + origin.h;
  let left = leftEdge;
  let right = rightEdge;
  let top = topEdge;
  let bottom = bottomEdge;

  if (handle.includes("w")) left = snapCoordinate(leftEdge + dx, snap);
  if (handle.includes("e")) right = snapCoordinate(rightEdge + dx, snap);
  if (handle.includes("n")) top = snapCoordinate(topEdge + dy, snap);
  if (handle.includes("s")) bottom = snapCoordinate(bottomEdge + dy, snap);

  if (handle.includes("w")) left = Math.min(left, right - minW);
  if (handle.includes("e")) right = Math.max(right, left + minW);
  if (handle.includes("n")) top = Math.min(top, bottom - minH);
  if (handle.includes("s")) bottom = Math.max(bottom, top + minH);

  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function beginResize(
  event: ReactPointerEvent<SVGElement>,
  zoom: number,
  snapToGrid: boolean,
  rect: Rect,
  handle: ResizeHandle,
  onPreview: (bounds: Rect) => void,
  onCommit: (bounds: Rect) => boolean | undefined,
  onCancel: () => void,
  startGesture: StartOverlayGesture,
  onBegin: () => void = () => {},
  onEnd: () => void = () => {},
  onGestureCancel?: () => void,
) {
  const start = { x: event.clientX, y: event.clientY };
  const origin = { ...rect };
  let latest: Rect = origin;
  let completed = false;
  const preview = createFramePreview<Rect>((bounds) => onPreview(bounds));
  const rollback = () => {
    preview.cancel();
    onCancel();
  };
  const cancel = () => {
    if (completed) return;
    completed = true;
    safelyCancel({ onGestureEnd: onEnd, onGestureCancel }, rollback);
  };
  const move = (next: PointerEvent) => {
    const dx = (next.clientX - start.x) / zoom;
    const dy = (next.clientY - start.y) / zoom;
    latest = resizeRect(origin, handle, dx, dy, 32, snapToGrid);
    preview.schedule(latest);
  };
  const up = (next: PointerEvent) => {
    if (completed) return;
    try {
      move(next);
      preview.flush();
      const result = onCommit(latest);
      if (result === false) {
        cancel();
        return;
      }
      completed = true;
      onEnd();
    } catch (error) {
      if (!completed) {
        try {
          cancel();
        } catch {
          // Preserve the commit failure while still attempting rollback.
        }
      }
      throw error;
    }
  };
  onBegin();
  try {
    startGesture(event, {
      onMove: move,
      onUp: up,
      onCancel: cancel,
      onCleanup: preview.cancel,
      onDispose: cancel,
    });
  } catch (error) {
    try {
      cancel();
    } catch {
      // Preserve the start failure while still attempting rollback.
    }
    throw error;
  }
}
