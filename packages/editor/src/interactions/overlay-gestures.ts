export interface OverlayPointerGesture {
  /** Cancel the active gesture and run its cancellation cleanup. */
  cancel(): void;
  /** Dispose listeners without dispatching another pointer event. */
  dispose(): void;
}

export interface OverlayPointerGestureOptions {
  event: {
    currentTarget: Element;
    pointerId: number;
  };
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
  onCancel: () => void;
  onCleanup?: () => void;
  onDispose?: () => void;
}

/**
 * Own the window listeners and pointer capture for one overlay gesture.
 * Gesture-specific math and React preview callbacks stay with the overlay;
 * this boundary guarantees that every exit path removes listeners, releases
 * capture, and gives the caller a place to cancel pending animation work.
 */
export function startOverlayPointerGesture(options: OverlayPointerGestureOptions): OverlayPointerGesture {
  const { event, onMove, onUp, onCancel, onCleanup, onDispose } = options;
  const handle = event.currentTarget;
  const pointerId = event.pointerId;
  let active = true;

  const releaseCapture = () => {
    try {
      handle.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  };
  const cleanup = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    try {
      onCleanup?.();
    } finally {
      releaseCapture();
    }
  };
  const move = (next: PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    try {
      onMove(next);
    } catch (error) {
      active = false;
      const failure = error;
      try {
        onCancel();
      } catch {
        // Preserve the original move failure while still attempting cleanup.
      } finally {
        try {
          cleanup();
        } catch {
          // Preserve the original move failure.
        }
      }
      throw failure;
    }
  };
  const up = (next: PointerEvent) => {
    if (!active || next.pointerId !== pointerId) return;
    active = false;
    runWithCleanup(() => onUp(next));
  };
  const cancel = (next: PointerEvent) => {
    if (!active || next.pointerId !== pointerId) return;
    active = false;
    runWithCleanup(onCancel);
  };

  const runWithCleanup = (callback: () => void) => {
    let failure: unknown;
    let didFail = false;
    try {
      callback();
    } catch (error) {
      failure = error;
      didFail = true;
    }
    try {
      cleanup();
    } catch (error) {
      if (!didFail) {
        failure = error;
        didFail = true;
      }
    }
    if (didFail) throw failure;
  };

  try {
    handle.setPointerCapture(pointerId);
  } catch {
    // Pointer capture is unavailable in some synthetic test events.
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);

  return {
    cancel: () => {
      if (!active) return;
      active = false;
      runWithCleanup(onCancel);
    },
    dispose: () => {
      if (!active) return;
      active = false;
      runWithCleanup(() => onDispose?.());
    },
  };
}

export interface FramePreview<T> {
  schedule(value: T): void;
  flush(): void;
  cancel(): void;
}

/** Coalesce React preview updates to one animation frame. */
export function createFramePreview<T>(apply: (value: T) => void): FramePreview<T> {
  let frame: number | null = null;
  let pending: T | undefined;
  let hasPending = false;

  const clearFrame = () => {
    if (frame !== null) {
      window.cancelAnimationFrame(frame);
      frame = null;
    }
  };
  const flush = () => {
    clearFrame();
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
    cancel: () => {
      clearFrame();
      pending = undefined;
      hasPending = false;
    },
  };
}
