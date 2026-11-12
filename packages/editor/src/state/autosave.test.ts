import { afterEach, describe, expect, it, vi } from "vitest";

import { AutosaveController, type AutosaveTab } from "./autosave";

const tab = (source: string, savedSource = "baseline", id = "tab-1"): AutosaveTab => ({
  id,
  source,
  savedSource,
  linked: true,
  valid: true,
});

describe("automatic saves", () => {
  afterEach(() => vi.useRealTimers());

  it("debounces and coalesces to the latest source", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => "saved" as const);
    const status = vi.fn();
    const controller = new AutosaveController({ save, onStatus: status });
    controller.update([tab("first")]);
    expect(status).toHaveBeenLastCalledWith("tab-1", "unsaved");
    await vi.advanceTimersByTimeAsync(400);
    expect(save).not.toHaveBeenCalled();
    controller.update([tab("latest")]);
    await vi.advanceTimersByTimeAsync(599);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("tab-1", "latest");
    controller.dispose();
  });

  it("does not restart the debounce for unchanged viewport or status renders", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => "saved" as const);
    const controller = new AutosaveController({ save, onStatus: vi.fn() });
    controller.update([tab("stable")]);
    for (let n = 0; n < 5; n += 1) {
      await vi.advanceTimersByTimeAsync(100);
      controller.update([tab("stable")]);
    }
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("tab-1", "stable");
    controller.dispose();
  });

  it("keeps dirty linked tabs unsaved when disabled and saves after re-enabling", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => "saved" as const);
    const status = vi.fn();
    const controller = new AutosaveController({ save, onStatus: status }, false);
    controller.update([tab("changed")]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(save).not.toHaveBeenCalled();
    controller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith("tab-1", "saving");
    controller.dispose();
  });

  it("skips unlinked and invalid tabs", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => "saved" as const);
    const controller = new AutosaveController({ save, onStatus: vi.fn() });
    controller.update([
      { ...tab("unlinked"), linked: false },
      { ...tab("invalid", "baseline", "tab-2"), valid: false },
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(save).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("reports failure and retries after a new edit", async () => {
    vi.useFakeTimers();
    const save = vi
      .fn()
      .mockResolvedValueOnce("error" as const)
      .mockResolvedValueOnce("saved" as const);
    const status = vi.fn();
    const controller = new AutosaveController({ save, onStatus: status });
    controller.update([tab("first")]);
    await vi.advanceTimersByTimeAsync(600);
    controller.update([tab("retry")]);
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("tab-1", "retry");
    expect(status).toHaveBeenCalledWith("tab-1", "save-error");
    controller.dispose();
  });

  it("flushes eligible tabs immediately", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => "saved" as const);
    const controller = new AutosaveController({ save, onStatus: vi.fn() });
    controller.update([tab("changed")]);
    controller.flush();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it("retries the unchanged source when a gesture gate opens", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => "saved" as const);
    const controller = new AutosaveController({ save, onStatus: vi.fn() });
    controller.update([{ ...tab("held"), allowed: false }]);
    await vi.advanceTimersByTimeAsync(900);
    expect(save).not.toHaveBeenCalled();
    controller.update([{ ...tab("held"), allowed: true }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("tab-1", "held");
    controller.dispose();
  });
});
