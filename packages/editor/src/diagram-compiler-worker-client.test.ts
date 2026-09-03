import { describe, expect, it, vi } from "vitest";

import type { DiagramCompilation } from "./diagram-compiler";
import {
  DiagramCompilerWorkerClient,
  type CompilationRequest,
  type CompilationWorker,
} from "./diagram-compiler-worker-client";

const compilation: DiagramCompilation = {
  ok: false,
  issues: [],
  svg: null,
  invariantFailures: [],
};

function request(id: number): CompilationRequest {
  return { id, source: `diagram ${id} {}`, snapToGrid: false };
}

function createWorker(postMessage: CompilationWorker["postMessage"] = vi.fn()): CompilationWorker {
  return {
    postMessage,
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  };
}

describe("DiagramCompilerWorkerClient", () => {
  it("settles a request when worker construction fails", () => {
    const onFailure = vi.fn();
    const client = new DiagramCompilerWorkerClient({
      createWorker: () => {
        throw new Error("worker unavailable");
      },
      onResponse: vi.fn(),
      onFailure,
    });

    client.request(request(1));

    expect(client.isBusy()).toBe(false);
    expect(onFailure).toHaveBeenCalledWith(
      request(1),
      expect.objectContaining({ kind: "constructor" }),
    );
  });

  it("terminates a worker and settles a request when postMessage fails", () => {
    const worker = createWorker(() => {
      throw new Error("post failed");
    });
    const onFailure = vi.fn();
    const client = new DiagramCompilerWorkerClient({
      createWorker: () => worker,
      onResponse: vi.fn(),
      onFailure,
    });

    client.request(request(1));

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(client.isBusy()).toBe(false);
    expect(onFailure).toHaveBeenCalledWith(
      request(1),
      expect.objectContaining({ kind: "post-message" }),
    );
  });

  it.each([
    ["runtime", "onerror"],
    ["message-deserialization", "onmessageerror"],
  ] as const)("settles a request after a worker %s", (kind, eventName) => {
    const worker = createWorker();
    const onFailure = vi.fn();
    const client = new DiagramCompilerWorkerClient({
      createWorker: () => worker,
      onResponse: vi.fn(),
      onFailure,
    });
    const active = request(1);
    client.request(active);

    if (eventName === "onerror") worker.onerror?.({ message: "worker failed" } as ErrorEvent);
    else worker.onmessageerror?.({} as MessageEvent<unknown>);

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(client.isBusy()).toBe(false);
    expect(onFailure).toHaveBeenCalledWith(
      active,
      expect.objectContaining({ kind }),
    );
  });

  it("settles a request after an invalid/deserialization response and retries with a fresh worker", () => {
    const firstWorker = createWorker();
    const secondWorker = createWorker();
    const workers = [firstWorker, secondWorker];
    const onFailure = vi.fn();
    const onResponse = vi.fn();
    const client = new DiagramCompilerWorkerClient({
      createWorker: () => workers.shift()!,
      onResponse,
      onFailure,
    });
    const first = request(1);
    client.request(first);
    firstWorker.onmessage?.({ data: null } as MessageEvent<unknown>);

    expect(firstWorker.terminate).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith(
      first,
      expect.objectContaining({ kind: "invalid-message" }),
    );

    const second = request(2);
    client.request(second);
    secondWorker.onmessage?.({
      data: { ...second, compilation },
    } as MessageEvent<unknown>);

    expect(onResponse).toHaveBeenCalledWith({ ...second, compilation });
    expect(client.isBusy()).toBe(false);
  });

  it("ignores replies from a replaced worker while preserving request ids", () => {
    const firstWorker = createWorker();
    const secondWorker = createWorker();
    const workers = [firstWorker, secondWorker];
    const onResponse = vi.fn();
    const client = new DiagramCompilerWorkerClient({
      createWorker: () => workers.shift()!,
      onResponse,
      onFailure: vi.fn(),
    });
    const first = request(1);
    client.request(first);
    client.restart();
    const second = request(2);
    client.request(second);

    firstWorker.onmessage?.({ data: { ...first, compilation } } as MessageEvent<unknown>);
    expect(onResponse).not.toHaveBeenCalled();
    secondWorker.onmessage?.({ data: { ...second, compilation } } as MessageEvent<unknown>);
    expect(onResponse).toHaveBeenCalledWith({ ...second, compilation });
  });
});
