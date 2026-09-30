import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PointerEvent as ReactPointerEvent } from "react";

import {
  beginMove,
  beginResize,
  type AlignmentGuidePreviewController,
  type MovePreviewController,
  type StartOverlayGesture,
} from "./move-resize-gestures";

function installAnimationFrame() {
  let next = 1;
  const frames = new Map<number, FrameRequestCallback>();
  const fakeWindow = {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const id = next++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    runFrames: () => {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(0);
      }
    },
  };
  vi.stubGlobal("window", fakeWindow);
  return fakeWindow;
}

function pointer(clientX: number, clientY: number) {
  return { clientX, clientY } as PointerEvent;
}

function captureGesture() {
  let options: Parameters<StartOverlayGesture>[1] | undefined;
  const startGesture = vi.fn<StartOverlayGesture>((_event, next) => {
    options = next;
    return { cancel: vi.fn(), dispose: vi.fn() };
  });
  return {
    startGesture,
    options: () => {
      if (!options) throw new Error("gesture was not started");
      return options;
    },
  };
}

function event(clientX = 0, clientY = 0) {
  return { clientX, clientY } as unknown as ReactPointerEvent<SVGElement>;
}

const noopPreview: MovePreviewController = {
  update: vi.fn(),
  commit: vi.fn(),
  finish: vi.fn(),
};

const noopGuides: AlignmentGuidePreviewController = {
  update: vi.fn(),
  finish: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("move gesture completion", () => {
  it("samples pointerup and ends one successful transaction", () => {
    installAnimationFrame();
    const gesture = captureGesture();
    const move = vi.fn(() => true);
    const end = vi.fn();
    const cancel = vi.fn();
    beginMove(
      event(0, 20),
      1,
      false,
      { x: 10, y: 20, w: 40, h: 30 },
      move,
      noopPreview,
      [],
      noopGuides,
      gesture.startGesture,
      vi.fn(),
      end,
      cancel,
    );

    gesture.options().onUp(pointer(18, 33));

    expect(move).toHaveBeenCalledWith(28, 33, 18, 13);
    expect(noopPreview.commit).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("keeps the preview under the pointer beside a peer and settles onto its line on release", () => {
    const frames = installAnimationFrame();
    const gesture = captureGesture();
    const move = vi.fn(() => true);
    const preview: MovePreviewController = { update: vi.fn(), commit: vi.fn(), finish: vi.fn() };
    const guides: AlignmentGuidePreviewController = { update: vi.fn(), finish: vi.fn() };
    beginMove(
      event(),
      1,
      false,
      { x: 0, y: 0, w: 20, h: 20 },
      move,
      preview,
      [{ x: 100, y: 3, w: 20, h: 20 }],
      guides,
      gesture.startGesture,
      vi.fn(),
      vi.fn(),
    );

    gesture.options().onMove(pointer(10, 1));
    frames.runFrames();
    expect(preview.update).toHaveBeenLastCalledWith(10, 1);
    expect(guides.update).toHaveBeenLastCalledWith([expect.objectContaining({ axis: "y", position: 13 })]);

    gesture.options().onUp(pointer(10, 1));
    expect(preview.update).toHaveBeenLastCalledWith(10, 3);
    expect(move).toHaveBeenCalledWith(10, 3, 10, 3);
  });

  it("rolls back and cancels when publication rejects or throws", () => {
    installAnimationFrame();
    for (const outcome of [false, new Error("publish failed")] as const) {
      const gesture = captureGesture();
      const preview: MovePreviewController = {
        update: vi.fn(),
        commit: vi.fn(),
        finish: vi.fn(),
      };
      const end = vi.fn();
      const cancel = vi.fn();
      const move = vi.fn(() => {
        if (outcome instanceof Error) throw outcome;
        return outcome;
      });
      beginMove(
        event(),
        1,
        false,
        { x: 0, y: 0, w: 20, h: 20 },
        move,
        preview,
        [],
        noopGuides,
        gesture.startGesture,
        vi.fn(),
        end,
        cancel,
      );

      if (outcome instanceof Error) {
        expect(() => gesture.options().onUp(pointer(5, 5))).toThrow(outcome);
      } else {
        gesture.options().onUp(pointer(5, 5));
      }
      expect(preview.finish).toHaveBeenCalledOnce();
      expect(end).not.toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
    }
  });

  it("ends the transaction after publication even when visual commit fails", () => {
    installAnimationFrame();
    const gesture = captureGesture();
    const preview: MovePreviewController = {
      update: vi.fn(),
      commit: vi.fn(() => { throw new Error("visual commit failed"); }),
      finish: vi.fn(),
    };
    const end = vi.fn();
    const cancel = vi.fn();
    beginMove(
      event(),
      1,
      false,
      { x: 0, y: 0, w: 20, h: 20 },
      vi.fn(() => true),
      preview,
      [],
      noopGuides,
      gesture.startGesture,
      vi.fn(),
      end,
      cancel,
    );

    expect(() => gesture.options().onUp(pointer(5, 5))).toThrow("visual commit failed");
    expect(preview.finish).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancels if gesture setup fails after beginning the transaction", () => {
    const failure = new Error("setup failed");
    const preview: MovePreviewController = {
      update: vi.fn(),
      commit: vi.fn(),
      finish: vi.fn(),
    };
    const cancel = vi.fn();
    const startGesture = vi.fn<StartOverlayGesture>(() => { throw failure; });

    expect(() => beginMove(
      event(),
      1,
      false,
      { x: 0, y: 0, w: 20, h: 20 },
      vi.fn(() => true),
      preview,
      [],
      noopGuides,
      startGesture,
      vi.fn(),
      vi.fn(),
      cancel,
    )).toThrow(failure);
    expect(preview.finish).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe("resize gesture completion", () => {
  it("cancels exactly once and clears the preview on pointer cancellation", () => {
    installAnimationFrame();
    const gesture = captureGesture();
    const onCancel = vi.fn();
    const transactionCancel = vi.fn();
    const end = vi.fn();
    beginResize(
      event(),
      1,
      false,
      { x: 0, y: 0, w: 100, h: 80 },
      "se",
      vi.fn(),
      vi.fn(() => true),
      onCancel,
      gesture.startGesture,
      vi.fn(),
      end,
      transactionCancel,
    );

    gesture.options().onCancel();
    gesture.options().onDispose?.();

    expect(onCancel).toHaveBeenCalledOnce();
    expect(transactionCancel).toHaveBeenCalledOnce();
    expect(end).not.toHaveBeenCalled();
  });

  it("rolls back a rejected resize without committing history", () => {
    installAnimationFrame();
    const gesture = captureGesture();
    const onCancel = vi.fn();
    const transactionCancel = vi.fn();
    const commit = vi.fn(() => false);
    beginResize(
      event(),
      1,
      false,
      { x: 0, y: 0, w: 100, h: 80 },
      "e",
      vi.fn(),
      commit,
      onCancel,
      gesture.startGesture,
      vi.fn(),
      vi.fn(),
      transactionCancel,
    );

    gesture.options().onUp(pointer(20, 0));

    expect(commit).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(transactionCancel).toHaveBeenCalledOnce();
  });

  it("ends exactly once for a successful resize", () => {
    installAnimationFrame();
    const gesture = captureGesture();
    const end = vi.fn();
    const transactionCancel = vi.fn();
    const commit = vi.fn(() => true);
    beginResize(
      event(),
      1,
      false,
      { x: 0, y: 0, w: 100, h: 80 },
      "s",
      vi.fn(),
      commit,
      vi.fn(),
      gesture.startGesture,
      vi.fn(),
      end,
      transactionCancel,
    );

    gesture.options().onUp(pointer(0, 20));
    gesture.options().onCancel();

    expect(commit).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    expect(transactionCancel).not.toHaveBeenCalled();
  });
});
