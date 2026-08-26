import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const VIEWPORT_COMMIT_DELAY_MS = 120;
const WHEEL_ZOOM_SENSITIVITY = 0.002;

/** The first frame leaves the app chrome and some of the surrounding canvas visible. */
export const DEFAULT_VIEWPORT_ZOOM = 0.9;
export const DEFAULT_VIEWPORT_TOP_MARGIN = 96;
export const DEFAULT_VIEWPORT_LEFT_MARGIN = 96;
export const DEFAULT_VIEWPORT_RIGHT_MARGIN = 40;
export const DEFAULT_VIEWPORT_BOTTOM_MARGIN = 96;
export const DEFAULT_EMPTY_CANVAS_WIDTH = 480;
export const DEFAULT_EMPTY_CANVAS_HEIGHT = 240;

export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface ViewportChangeOptions {
  userInitiated?: boolean;
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function normalizedWheelDelta(
  value: number,
  deltaMode: number,
  pageSize: number,
): number {
  if (deltaMode === 1) return value * 16;
  if (deltaMode === 2) return value * pageSize;
  return value;
}

/**
 * Center a diagram when it fits, while keeping a safe starting margin when it
 * is wider or taller than the viewport. Empty diagrams use the same framing
 * as the visible empty-canvas card instead of being positioned at x=0.
 */
export function defaultViewportForContent(
  stageWidth: number,
  contentWidth: number,
  stageHeight = 0,
  contentHeight = 0,
): Viewport {
  const width = Math.max(0, contentWidth) || DEFAULT_EMPTY_CANVAS_WIDTH;
  const height = Math.max(0, contentHeight) || DEFAULT_EMPTY_CANVAS_HEIGHT;
  const horizontalFit = stageWidth > 0
    ? (stageWidth - DEFAULT_VIEWPORT_LEFT_MARGIN - DEFAULT_VIEWPORT_RIGHT_MARGIN) / width
    : Number.POSITIVE_INFINITY;
  const verticalFit = stageHeight > 0
    ? (stageHeight - DEFAULT_VIEWPORT_TOP_MARGIN - DEFAULT_VIEWPORT_BOTTOM_MARGIN) / height
    : Number.POSITIVE_INFINITY;
  const zoom = clampZoom(Math.min(DEFAULT_VIEWPORT_ZOOM, horizontalFit, verticalFit));
  const scaledWidth = width * zoom;
  const scaledHeight = height * zoom;
  const centeredX = (stageWidth - scaledWidth) / 2;
  const centeredY = (stageHeight - scaledHeight) / 2;

  return {
    panX: stageWidth > 0
      ? Math.max(DEFAULT_VIEWPORT_LEFT_MARGIN, Math.min(centeredX, stageWidth - scaledWidth - DEFAULT_VIEWPORT_RIGHT_MARGIN))
      : DEFAULT_VIEWPORT_LEFT_MARGIN,
    panY: stageHeight > 0
      ? Math.max(DEFAULT_VIEWPORT_TOP_MARGIN, centeredY)
      : DEFAULT_VIEWPORT_TOP_MARGIN,
    zoom,
  };
}

export function CanvasStage({
  children,
  viewport,
  onViewportChange,
  onBackgroundClick,
  onFitRequest,
  onCatalogDragOver,
  onCatalogDrop,
  contentSize,
  defaultFrameKey = 0,
}: {
  children: ReactNode;
  viewport: Viewport;
  onViewportChange: (next: Viewport, options?: ViewportChangeOptions) => void;
  onBackgroundClick: () => void;
  onFitRequest?: (fit: () => void) => void;
  onCatalogDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onCatalogDrop?: (event: DragEvent<HTMLDivElement>, point: { x: number; y: number }) => void;
  contentSize?: { width: number; height: number };
  defaultFrameKey?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const spaceRef = useRef(false);
  const interactivePointerRef = useRef(false);
  const framedKeyRef = useRef<number | null>(null);
  const viewportRef = useRef(viewport);
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const pendingViewportRef = useRef<Viewport | null>(null);
  const pendingViewportOptionsRef = useRef<ViewportChangeOptions | undefined>(undefined);
  const viewportCommitTimerRef = useRef<number | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelTargetRef = useRef<Viewport | null>(null);

  const applyViewport = useCallback((next: Viewport) => {
    viewportRef.current = next;
    if (worldRef.current) {
      worldRef.current.style.transform =
        `translate3d(${next.panX}px, ${next.panY}px, 0) scale(${next.zoom})`;
    }
  }, []);

  const flushViewportChange = useCallback(() => {
    if (viewportCommitTimerRef.current !== null) {
      window.clearTimeout(viewportCommitTimerRef.current);
      viewportCommitTimerRef.current = null;
    }
    const next = pendingViewportRef.current;
    if (!next) return;
    pendingViewportRef.current = null;
    const options = pendingViewportOptionsRef.current;
    pendingViewportOptionsRef.current = undefined;
    onViewportChangeRef.current(next, options);
  }, []);

  const previewViewportChange = useCallback((next: Viewport, options?: ViewportChangeOptions) => {
    applyViewport(next);
    pendingViewportRef.current = next;
    pendingViewportOptionsRef.current = options;
  }, [applyViewport]);

  const enqueueViewportChange = useCallback((next: Viewport, options?: ViewportChangeOptions) => {
    previewViewportChange(next, options);
    if (viewportCommitTimerRef.current !== null) {
      window.clearTimeout(viewportCommitTimerRef.current);
    }
    viewportCommitTimerRef.current = window.setTimeout(
      flushViewportChange,
      VIEWPORT_COMMIT_DELAY_MS,
    );
  }, [flushViewportChange, previewViewportChange]);

  useLayoutEffect(() => {
    // During a wheel or pan gesture the DOM transform is intentionally ahead
    // of persisted React state. Do not snap it back if unrelated UI rerenders.
    if (pendingViewportRef.current === null) applyViewport(viewport);
  }, [applyViewport, viewport]);

  useEffect(() => () => {
    if (viewportCommitTimerRef.current !== null) {
      window.clearTimeout(viewportCommitTimerRef.current);
    }
    viewportCommitTimerRef.current = null;
    pendingViewportRef.current = null;
    pendingViewportOptionsRef.current = undefined;
    if (wheelFrameRef.current !== null) window.cancelAnimationFrame(wheelFrameRef.current);
    wheelFrameRef.current = null;
    wheelTargetRef.current = null;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !event.repeat) spaceRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spaceRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !contentSize) return;

    const frameIfNeeded = () => {
      if (framedKeyRef.current === defaultFrameKey) return;
      const width = el.getBoundingClientRect().width;
      if (!width) return;

      framedKeyRef.current = defaultFrameKey;
      onViewportChange(
        defaultViewportForContent(
          width,
          contentSize.width,
          el.getBoundingClientRect().height,
          contentSize.height,
        ),
        { userInitiated: false },
      );
    };

    frameIfNeeded();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(frameIfNeeded);
    observer.observe(el);
    return () => observer.disconnect();
  }, [contentSize, defaultFrameKey, onViewportChange]);

  useEffect(() => {
    onFitRequest?.(() => {
      const el = ref.current;
      if (!el) return;
      const world = el.querySelector(".canvas-world") as HTMLElement | null;
      if (!world) return;
      const content = world.querySelector(".diagram-svg, .empty-canvas") as HTMLElement | null;
      if (!content) return;
      const rect = el.getBoundingClientRect();
      const cw = content.scrollWidth || parseInt(content.getAttribute("width") ?? "800", 10);
      const ch = content.scrollHeight || parseInt(content.getAttribute("height") ?? "600", 10);
      const padding = 48;
      const scale = clampZoom(
        Math.min((rect.width - padding * 2) / cw, (rect.height - padding * 2) / ch),
      );
      onViewportChange({
        panX: (rect.width - cw * scale) / 2,
        panY: (rect.height - ch * scale) / 2,
        zoom: scale,
      });
    });
  }, [onFitRequest, onViewportChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = wheelTargetRef.current ?? viewportRef.current;
      const deltaX = normalizedWheelDelta(e.deltaX, e.deltaMode, el.clientWidth);
      const deltaY = normalizedWheelDelta(e.deltaY, e.deltaMode, el.clientHeight);
      let next: Viewport;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const zoom = clampZoom(cur.zoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY));
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        next = {
          panX: cx - ((cx - cur.panX) * zoom) / cur.zoom,
          panY: cy - ((cy - cur.panY) * zoom) / cur.zoom,
          zoom,
        };
      } else {
        next = {
          ...cur,
          panX: cur.panX - deltaX,
          panY: cur.panY - deltaY,
        };
      }
      wheelTargetRef.current = next;
      if (wheelFrameRef.current !== null) return;
      wheelFrameRef.current = window.requestAnimationFrame(() => {
        wheelFrameRef.current = null;
        const target = wheelTargetRef.current;
        wheelTargetRef.current = null;
        if (target) enqueueViewportChange(target, { userInitiated: true });
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enqueueViewportChange]);

  useEffect(() => {
    const onNav = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
    };
    window.addEventListener("wheel", onNav, { passive: false });
    return () => window.removeEventListener("wheel", onNav);
  }, []);

  return (
    <div
      ref={ref}
      className={`canvas-stage${panning ? " is-panning" : ""}`}
      data-testid="canvas-stage"
      onDragOver={onCatalogDragOver}
      onDrop={(event) => {
        if (!onCatalogDrop) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const current = viewportRef.current;
        onCatalogDrop(event, {
          x: (event.clientX - rect.left - current.panX) / current.zoom,
          y: (event.clientY - rect.top - current.panY) / current.zoom,
        });
      }}
      onClick={(event) => {
        if (interactivePointerRef.current) {
          interactivePointerRef.current = false;
          return;
        }
        const target = event.target as Element;
        if (!target.closest("[data-interactive]")) onBackgroundClick();
      }}
      onPointerDownCapture={(event) => {
        // Keep this through the corresponding click. Some engines dispatch
        // click after zero-delay timers, and selection can replace its target.
        interactivePointerRef.current = Boolean(
          (event.target as Element).closest("[data-interactive]"),
        );
      }}
      onPointerDown={(e) => {
        const shouldPan = e.button === 1 || (e.button === 0 && spaceRef.current);
        if (!shouldPan) return;
        if (e.button === 0 && (e.target as Element).closest("[data-interactive]")) return;
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const origin = viewportRef.current;
        let dragged = false;
        let frame = 0;
        let latest: Viewport | null = null;
        const paint = () => {
          frame = 0;
          if (!latest) return;
          const next = latest;
          latest = null;
          previewViewportChange(next, { userInitiated: true });
        };
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (!dragged && (dx !== 0 || dy !== 0)) {
            dragged = true;
            setPanning(true);
            interactivePointerRef.current = true;
          }
          if (!dragged) return;
          latest = {
            ...origin,
            panX: origin.panX + dx,
            panY: origin.panY + dy,
          };
          if (!frame) frame = window.requestAnimationFrame(paint);
        };
        const cancel = () => {
          if (frame) window.cancelAnimationFrame(frame);
          frame = 0;
          latest = null;
          flushViewportChange();
          setPanning(false);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", cancel);
        };
        const up = () => {
          if (frame) window.cancelAnimationFrame(frame);
          if (latest) previewViewportChange(latest, { userInitiated: true });
          frame = 0;
          latest = null;
          flushViewportChange();
          setPanning(false);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", cancel);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
      }}
    >
      <div
        ref={worldRef}
        className="canvas-world"
        style={{
          transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0) scale(${viewport.zoom})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export { MIN_ZOOM, MAX_ZOOM };
