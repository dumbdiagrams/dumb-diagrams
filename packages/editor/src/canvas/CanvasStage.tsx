import { useEffect, useRef, useState, type ReactNode } from "react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function CanvasStage({
  children,
  viewport,
  onViewportChange,
  onBackgroundClick,
  onFitRequest,
}: {
  children: ReactNode;
  viewport: Viewport;
  onViewportChange: (next: Viewport) => void;
  onBackgroundClick: () => void;
  onFitRequest?: (fit: () => void) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [panning, setPanning] = useState(false);
  const spaceRef = useRef(false);
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
        const target = event.target as Element;
        if (!target.closest("[data-interactive]")) onBackgroundClick();
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
