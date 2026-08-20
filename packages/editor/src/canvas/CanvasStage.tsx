import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

/** The first frame leaves the app chrome and some of the surrounding canvas visible. */
export const DEFAULT_VIEWPORT_ZOOM = 0.9;
export const DEFAULT_VIEWPORT_TOP_MARGIN = 96;
export const DEFAULT_VIEWPORT_LEFT_MARGIN = 96;
export const DEFAULT_VIEWPORT_RIGHT_MARGIN = 40;

export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/**
 * Place a diagram toward the upper-right without allowing it to disappear
 * behind the left tool dock when the artboard is wider than the viewport.
 */
export function defaultViewportForContent(
  stageWidth: number,
  contentWidth: number,
): Viewport {
  const width = Math.max(0, contentWidth);
  const rightAnchoredX = stageWidth - width * DEFAULT_VIEWPORT_ZOOM - DEFAULT_VIEWPORT_RIGHT_MARGIN;

  return {
    panX: Math.max(DEFAULT_VIEWPORT_LEFT_MARGIN, rightAnchoredX),
    panY: DEFAULT_VIEWPORT_TOP_MARGIN,
    zoom: DEFAULT_VIEWPORT_ZOOM,
  };
}

export function CanvasStage({
  children,
  viewport,
  onViewportChange,
  onBackgroundClick,
  onFitRequest,
  contentSize,
  defaultFrameKey = 0,
}: {
  children: ReactNode;
  viewport: Viewport;
  onViewportChange: (next: Viewport) => void;
  onBackgroundClick: () => void;
  onFitRequest?: (fit: () => void) => void;
  contentSize?: { width: number; height: number };
  defaultFrameKey?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const spaceRef = useRef(false);
  const interactivePointerRef = useRef(false);
  const framedKeyRef = useRef<number | null>(null);
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  const setZoomAt = (nextZoom: number, anchor?: { x: number; y: number }) => {
    const el = ref.current;
    const cur = viewportRef.current;
    const k = clampZoom(nextZoom);
    if (!el || !anchor) {
      onViewportChange({ ...cur, zoom: k });
      return;
    }
    const rect = el.getBoundingClientRect();
    const cx = anchor.x - rect.left;
    const cy = anchor.y - rect.top;
    const panX = cx - ((cx - cur.panX) * k) / cur.zoom;
    const panY = cy - ((cy - cur.panY) * k) / cur.zoom;
    onViewportChange({ panX, panY, zoom: k });
  };

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
      onViewportChange(defaultViewportForContent(width, contentSize.width));
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
      onViewportChange({
        ...cur,
        panX: cur.panX - e.deltaX,
        panY: cur.panY - e.deltaY,
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onViewportChange]);

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
          onViewportChange({
            ...origin,
            panX: origin.panX + dx,
            panY: origin.panY + dy,
          });
        };
        const up = () => {
          setPanning(false);
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      <div
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
