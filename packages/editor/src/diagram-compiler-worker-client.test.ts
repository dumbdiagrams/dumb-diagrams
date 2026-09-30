import { describe, expect, it, vi } from "vitest";

import type { DiagramDocument } from "@dumb-diagrams/runtime/core";
import type { AutoFixPlan } from "./auto-fix";
import type { DiagramCompilation } from "./diagram-compiler";
import {
  DiagramCompilerWorkerClient,
  planAutoFixInWorker,
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
    expect(onFailure.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      kind: "constructor",
      error: expect.any(Error),
    }));
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

  it("accepts complete successful and failed compilation variants", () => {
    const worker = createWorker();
    const onResponse = vi.fn();
    const client = new DiagramCompilerWorkerClient({
      createWorker: () => worker,
      onResponse,
      onFailure: vi.fn(),
    });
    const active = request(1);
    client.request(active);
    worker.onmessage?.({
      data: {
        ...active,
        compilation: {
          ok: true,
          issues: [],
          svg: "<svg />",
          invariantFailures: [],
          doc: { resources: [], groups: [], edges: [], annotations: [] },
          layout: { nodes: [], groups: [], edges: [], symmetries: [], width: 0, height: 0 },
        },
      },
    } as MessageEvent<unknown>);

    expect(onResponse).toHaveBeenCalledOnce();
    expect(client.isBusy()).toBe(false);
  });

  it("accepts a structured compiler failure diagnostic from the worker", () => {
    const worker = createWorker();
    const onResponse = vi.fn();
    const client = new DiagramCompilerWorkerClient({
      createWorker: () => worker,
      onResponse,
      onFailure: vi.fn(),
    });
    const active = request(1);
    client.request(active);
    worker.onmessage?.({
      data: {
        ...active,
        compilation: {
          ...compilation,
          compilationError: {
            code: "compilation",
            phase: "routing",
            message: "Compilation failed during routing: injected routing fault",
          },
        },
      },
    } as MessageEvent<unknown>);

    expect(onResponse).toHaveBeenCalledOnce();
    expect(client.isBusy()).toBe(false);
  });

  it.each([
    { ...request(1), compilation: { ok: false } },
    { ...request(1), compilation: { ok: true, issues: [], svg: "", invariantFailures: [] } },
    { ...request(1), compilation: { ...compilation, issues: [null] } },
    {
      ...request(1),
      compilation: {
        ...compilation,
        compilationError: { code: "compilation", phase: "unknown", message: "bad phase" },
      },
    },
  ])("rejects malformed compilation payloads instead of passing them to the editor", (data) => {
    const worker = createWorker();
    const onFailure = vi.fn();
    const onResponse = vi.fn();
    const client = new DiagramCompilerWorkerClient({
      createWorker: () => worker,
      onResponse,
      onFailure,
    });
    const active = request(1);
    client.request(active);

    worker.onmessage?.({ data } as MessageEvent<unknown>);

    expect(onResponse).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(
      active,
      expect.objectContaining({ kind: "invalid-message" }),
    );
    expect(client.isBusy()).toBe(false);
  });

  it("rejects a well-shaped response that does not match the active request", () => {
    const worker = createWorker();
    const onFailure = vi.fn();
    const onResponse = vi.fn();
    const client = new DiagramCompilerWorkerClient({
      createWorker: () => worker,
      onResponse,
      onFailure,
    });
    const active = request(1);
    client.request(active);

    worker.onmessage?.({
      data: { ...active, source: "diagram wrong {}", compilation },
    } as MessageEvent<unknown>);

    expect(onResponse).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(
      active,
      expect.objectContaining({ kind: "invalid-message" }),
    );
    expect(worker.terminate).toHaveBeenCalledOnce();
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

describe("planAutoFixInWorker", () => {
  const doc = { resources: [], groups: [], edges: [] } as unknown as DiagramDocument;
  const workerPlan: AutoFixPlan = { status: "repaired", doc, strategy: "clear-routes-all", compilation };
  const localPlan: AutoFixPlan = { status: "unchanged", doc, strategy: "unchanged" };

  it("uses the worker's plan and discards the worker", async () => {
    const worker = createWorker();
    const plan = planAutoFixInWorker(() => worker, doc, true, () => localPlan);

    expect(worker.postMessage).toHaveBeenCalledWith({ autoFix: true, doc, snapToGrid: true });
    worker.onmessage?.({ data: workerPlan } as MessageEvent<unknown>);

    await expect(plan).resolves.toEqual(workerPlan);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("plans on the calling thread when the worker cannot start, fails, or sends an unusable plan", async () => {
    await expect(planAutoFixInWorker(() => {
      throw new Error("worker unavailable");
    }, doc, false, () => localPlan)).resolves.toEqual(localPlan);

    const failing = createWorker();
    const failed = planAutoFixInWorker(() => failing, doc, false, () => localPlan);
    failing.onerror?.({} as ErrorEvent);
    await expect(failed).resolves.toEqual(localPlan);

    const invalid = createWorker();
    const unusable = planAutoFixInWorker(() => invalid, doc, false, () => localPlan);
    invalid.onmessage?.({ data: { ...workerPlan, doc: null } } as MessageEvent<unknown>);
    await expect(unusable).resolves.toEqual(localPlan);
    expect(invalid.terminate).toHaveBeenCalledOnce();
  });
});
