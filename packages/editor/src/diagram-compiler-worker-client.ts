import type { DiagramCompilation } from "./diagram-compiler";

export type CompilationRequest = {
  id: number;
  source: string;
  snapToGrid: boolean;
};

export type CompilationResponse = CompilationRequest & {
  compilation: DiagramCompilation;
};

/** The small part of Worker used by the compiler client. */
export type CompilationWorker = {
  postMessage(message: CompilationRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
};

export type WorkerFailureKind =
  | "constructor"
  | "post-message"
  | "runtime"
  | "message-deserialization"
  | "invalid-message";

export type WorkerFailure = {
  kind: WorkerFailureKind;
  error: unknown;
};

type WorkerClientOptions = {
  createWorker: () => CompilationWorker;
  onResponse: (response: CompilationResponse) => void;
  onFailure: (request: CompilationRequest | null, failure: WorkerFailure) => void;
};

function isCompilationResponse(value: unknown): value is CompilationResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Partial<CompilationResponse>;
  return (
    typeof response.id === "number" &&
    typeof response.source === "string" &&
    typeof response.snapToGrid === "boolean" &&
    typeof response.compilation === "object" &&
    response.compilation !== null
  );
}

/**
 * Owns the worker's failure lifecycle so each posted request has a terminal
 * path. A failed worker is always discarded; the next request may create a
 * fresh one, or the caller may use its synchronous fallback.
 */
export class DiagramCompilerWorkerClient {
  private worker: CompilationWorker | null = null;
  private activeRequest: CompilationRequest | null = null;

  public constructor(private readonly options: WorkerClientOptions) {}

  public start(): void {
    this.ensureWorker(null);
  }

  public isBusy(): boolean {
    return this.activeRequest !== null;
  }

  /** Stop the current request without reporting a failure (it is stale). */
  public restart(): void {
    this.activeRequest = null;
    this.discardWorker();
    this.ensureWorker(null);
  }

  /** Post one request, reporting synchronously if setup or postMessage fails. */
  public request(request: CompilationRequest): void {
    if (this.activeRequest) this.restart();

    if (!this.ensureWorker(request)) return;
    const worker = this.worker;
    if (!worker) return;

    this.activeRequest = request;
    try {
      worker.postMessage(request);
    } catch (error) {
      this.failCurrent("post-message", error, worker);
    }
  }

  public dispose(): void {
    this.activeRequest = null;
    this.discardWorker();
  }

  private ensureWorker(request: CompilationRequest | null): boolean {
    if (this.worker) return true;

    let worker: CompilationWorker | null = null;
    try {
      worker = this.options.createWorker();
      const currentWorker = worker;
      currentWorker.onmessage = (event) => {
        if (this.worker !== currentWorker) return;
        const activeRequest = this.activeRequest;
        this.activeRequest = null;
        let data: unknown;
        try {
          data = event.data;
        } catch (error) {
          this.fail("message-deserialization", error, currentWorker, activeRequest);
          return;
        }
        if (!isCompilationResponse(data)) {
          this.fail(
            "invalid-message",
            new Error("Invalid compiler worker response"),
            currentWorker,
            activeRequest,
          );
          return;
        }
        this.options.onResponse(data);
      };
      currentWorker.onerror = (event) => {
        if (this.worker !== currentWorker) return;
        this.fail("runtime", event, currentWorker, this.activeRequest);
      };
      currentWorker.onmessageerror = (event) => {
        if (this.worker !== currentWorker) return;
        this.fail("message-deserialization", event, currentWorker, this.activeRequest);
      };
    } catch (error) {
      try {
        worker?.terminate();
      } catch {
        // A failed constructor may expose a partially initialized worker.
      }
      this.worker = null;
      this.activeRequest = null;
      if (request) this.options.onFailure(request, { kind: "constructor", error });
      return false;
    }

    this.worker = worker;
    return true;
  }

  private failCurrent(kind: WorkerFailureKind, error: unknown, worker: CompilationWorker): void {
    const activeRequest = this.activeRequest;
    this.activeRequest = null;
    this.fail(kind, error, worker, activeRequest);
  }

  private fail(
    kind: WorkerFailureKind,
    error: unknown,
    worker: CompilationWorker,
    request: CompilationRequest | null,
  ): void {
    this.activeRequest = null;
    if (this.worker === worker) this.discardWorker();
    if (request) this.options.onFailure(request, { kind, error });
  }

  private discardWorker(): void {
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    try {
      worker.terminate();
    } catch {
      // Termination is best effort; request state is already settled.
    }
  }
}
