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

  const applyViewport = useCallback((next: Viewport) => {
    viewportRef.current = next;
    if (worldRef.current) {
      worldRef.current.style.transform =
        `translate(${next.panX}px, ${next.panY}px) scale(${next.zoom})`;
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
  }, []);

  const setZoomAt = useCallback((nextZoom: number, anchor?: { x: number; y: number }) => {
    const el = ref.current;
    const cur = viewportRef.current;
    const k = clampZoom(nextZoom);
    if (!el || !anchor) {
      enqueueViewportChange({ ...cur, zoom: k });
      return;
    }
    const rect = el.getBoundingClientRect();
    const cx = anchor.x - rect.left;
    const cy = anchor.y - rect.top;
    const panX = cx - ((cx - cur.panX) * k) / cur.zoom;
    const panY = cy - ((cy - cur.panY) * k) / cur.zoom;
    enqueueViewportChange({ panX, panY, zoom: k });
  }, [enqueueViewportChange]);

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
      const cur = viewportRef.current;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        setZoomAt(cur.zoom * factor, { x: e.clientX, y: e.clientY });
        return;
      }
      enqueueViewportChange({
        ...cur,
        panX: cur.panX - e.deltaX,
        panY: cur.panY - e.deltaY,
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enqueueViewportChange, setZoomAt]);

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
        interactivePointerRef.current = Boolean(
          (event.target as Element).closest("[data-interactive]"),
        );
      }}
      onPointerUpCapture={() => {
        window.setTimeout(() => {
          interactivePointerRef.current = false;
        }, 0);
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
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (Math.hypot(dx, dy) > 3) {
            dragged = true;
            setPanning(true);
          }
          if (!dragged) return;
          previewViewportChange({
            ...origin,
            panX: origin.panX + dx,
            panY: origin.panY + dy,
          });
        };
        const cancel = () => {
          flushViewportChange();
          setPanning(false);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", cancel);
        };
        const up = () => {
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
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export { MIN_ZOOM, MAX_ZOOM };
