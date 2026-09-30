import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createFramePreview,
  startOverlayPointerGesture,
} from "./overlay-gestures";

class FakeWindow {
  private listeners = new Map<string, Set<(event: Event) => void>>();
  private frames = new Map<number, FrameRequestCallback>();
  private nextFrame = 1;

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener) return;
    const callback = typeof listener === "function" ? listener : (event: Event) => listener.handleEvent(event);
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
    if (!listener) return;
    const callback = typeof listener === "function" ? listener : (event: Event) => listener.handleEvent(event);
    this.listeners.get(type)?.delete(callback);
  }

  dispatch(type: string, event: Event) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  requestAnimationFrame(callback: FrameRequestCallback) {
    const id = this.nextFrame++;
    this.frames.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id: number) {
    this.frames.delete(id);
  }

  flushFrames() {
    const frames = [...this.frames.values()];
    this.frames.clear();
    frames.forEach((callback) => callback(0));
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const windows: FakeWindow[] = [];

function installWindow() {
  const fakeWindow = new FakeWindow();
  windows.push(fakeWindow);
  vi.stubGlobal("window", fakeWindow);
  return fakeWindow;
}

function pointerEvent(pointerId: number, clientX = 0, clientY = 0): Event {
  const event = new Event("pointermove");
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
  });
  return event;
}

afterEach(() => {
  vi.unstubAllGlobals();
  windows.length = 0;
});

describe("overlay gesture lifecycle", () => {
  it("filters unrelated pointers and cleans listeners and capture on pointerup", () => {
    const fakeWindow = installWindow();
    const releasePointerCapture = vi.fn();
    const handle = {
      setPointerCapture: vi.fn(),
      releasePointerCapture,
    } as unknown as Element;
    const moved = vi.fn();
    const finished = vi.fn();
    const gesture = startOverlayPointerGesture({
      event: { currentTarget: handle, pointerId: 7 },
      onMove: moved,
      onUp: finished,
      onCancel: vi.fn(),
    });

    fakeWindow.dispatch("pointermove", pointerEvent(8));
    expect(moved).not.toHaveBeenCalled();
    fakeWindow.dispatch("pointerup", pointerEvent(7));

    expect(finished).toHaveBeenCalledOnce();
    expect(releasePointerCapture).toHaveBeenCalledOnce();
    expect(fakeWindow.listenerCount("pointermove")).toBe(0);
    expect(fakeWindow.listenerCount("pointerup")).toBe(0);
    expect(fakeWindow.listenerCount("pointercancel")).toBe(0);
    gesture.dispose();
    expect(releasePointerCapture).toHaveBeenCalledOnce();
  });

  it("runs cleanup when a gesture callback throws and keeps the original error", () => {
    const fakeWindow = installWindow();
    const releasePointerCapture = vi.fn();
    const handle = {
      setPointerCapture: vi.fn(),
      releasePointerCapture,
    } as unknown as Element;
    const failure = new Error("commit failed");
    startOverlayPointerGesture({
      event: { currentTarget: handle, pointerId: 3 },
      onMove: vi.fn(),
      onUp: () => { throw failure; },
      onCancel: vi.fn(),
    });

    expect(() => fakeWindow.dispatch("pointerup", pointerEvent(3))).toThrow(failure);
    expect(releasePointerCapture).toHaveBeenCalledOnce();
    expect(fakeWindow.listenerCount("pointerup")).toBe(0);
  });

  it("releases capture even when preview cleanup throws", () => {
    const fakeWindow = installWindow();
    const releasePointerCapture = vi.fn();
    const handle = {
      setPointerCapture: vi.fn(),
      releasePointerCapture,
    } as unknown as Element;
    const cleanupFailure = new Error("cleanup failed");
    startOverlayPointerGesture({
      event: { currentTarget: handle, pointerId: 4 },
      onMove: vi.fn(),
      onUp: vi.fn(),
      onCancel: vi.fn(),
      onCleanup: () => { throw cleanupFailure; },
    });

    expect(() => fakeWindow.dispatch("pointercancel", pointerEvent(4))).toThrow(cleanupFailure);
    expect(releasePointerCapture).toHaveBeenCalledOnce();
  });

  it("flushes one pending preview frame and cancels an uncommitted frame", () => {
    const fakeWindow = installWindow();
    const apply = vi.fn();
    const preview = createFramePreview(apply);
    preview.schedule("first");
    preview.schedule("latest");
    expect(apply).not.toHaveBeenCalled();
    fakeWindow.flushFrames();
    expect(apply).toHaveBeenCalledWith("latest");

    preview.schedule("discarded");
    preview.cancel();
    fakeWindow.flushFrames();
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
