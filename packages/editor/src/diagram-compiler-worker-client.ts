import type { DiagramDocument } from "@dumb-diagrams/runtime/core";
import type { AutoFixPlan } from "./auto-fix";
import type { DiagramCompilation } from "./diagram-compiler";

export type CompilationRequest = {
  id: number;
  source: string;
  snapToGrid: boolean;
};

export type CompilationResponse = CompilationRequest & {
  compilation: DiagramCompilation;
};

export type AutoFixRequest = {
  autoFix: true;
  doc: DiagramDocument;
  snapToGrid: boolean;
};

/** The small part of Worker used by the compiler client. */
export type CompilationWorker = {
  postMessage(message: CompilationRequest | AutoFixRequest): void;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidationIssue(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.level === "error" || value.level === "warning") &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    (value.id === undefined || typeof value.id === "string")
  );
}

function isInvariantFailure(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    Array.isArray(value.elementIds) &&
    value.elementIds.every((id) => typeof id === "string")
  );
}

function isCompilationError(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    value.code === "compilation" &&
    (value.phase === "prepare" || value.phase === "layout" || value.phase === "routing" || value.phase === "render") &&
    typeof value.message === "string"
  );
}

function isSuccessfulCompilation(value: Record<string, unknown>): boolean {
  return (
    value.ok === true &&
    Array.isArray(value.issues) &&
    value.issues.every(isValidationIssue) &&
    typeof value.svg === "string" &&
    Array.isArray(value.invariantFailures) &&
    value.invariantFailures.every(isInvariantFailure) &&
    isRecord(value.doc) &&
    Array.isArray(value.doc.resources) &&
    Array.isArray(value.doc.groups) &&
    Array.isArray(value.doc.edges) &&
    Array.isArray(value.doc.annotations) &&
    isRecord(value.layout) &&
    Array.isArray(value.layout.nodes) &&
    Array.isArray(value.layout.groups) &&
    Array.isArray(value.layout.edges) &&
    Array.isArray(value.layout.symmetries) &&
    Number.isFinite(value.layout.width) &&
    Number.isFinite(value.layout.height)
  );
}

function isFailedCompilation(value: Record<string, unknown>): boolean {
  return (
    value.ok === false &&
    Array.isArray(value.issues) &&
    value.issues.every(isValidationIssue) &&
    value.svg === null &&
    Array.isArray(value.invariantFailures) &&
    value.invariantFailures.every(isInvariantFailure) &&
    (value.layout === undefined || value.layout === null) &&
    (value.compilationError === undefined || isCompilationError(value.compilationError)) &&
    (value.parseError === undefined || typeof value.parseError === "string") &&
    (value.parseErrorCode === undefined || typeof value.parseErrorCode === "string") &&
    (value.parseErrorLocation === undefined ||
      (isRecord(value.parseErrorLocation) &&
        Number.isSafeInteger(value.parseErrorLocation.line) &&
        Number.isSafeInteger(value.parseErrorLocation.column)))
  );
}

function isCompilation(value: unknown): value is DiagramCompilation {
  return isRecord(value) && (isSuccessfulCompilation(value) || isFailedCompilation(value));
}

export function isCompilationResponse(value: unknown): value is CompilationResponse {
  if (!isRecord(value)) return false;
  const response = value as Partial<CompilationResponse>;
  return (
    typeof response.id === "number" &&
    typeof response.source === "string" &&
    typeof response.snapToGrid === "boolean" &&
    isCompilation(response.compilation)
  );
}

export function isAutoFixPlan(value: unknown): value is AutoFixPlan {
  if (!isRecord(value)) return false;
  return (
    (value.status === "unchanged" ||
      value.status === "repaired" ||
      value.status === "unresolved" ||
      value.status === "blocked") &&
    typeof value.strategy === "string" &&
    isRecord(value.doc) &&
    Array.isArray(value.doc.resources) &&
    Array.isArray(value.doc.groups) &&
    Array.isArray(value.doc.edges) &&
    (value.message === undefined || typeof value.message === "string") &&
    (value.compilation === undefined || isCompilation(value.compilation))
  );
}

/**
 * Plan Auto-fix in a one-off worker so the canvas keeps painting. Any worker
 * failure, including an unusable response, plans on the calling thread instead.
 */
export function planAutoFixInWorker(
  createWorker: () => CompilationWorker,
  doc: DiagramDocument,
  snapToGrid: boolean,
  fallback: () => AutoFixPlan,
): Promise<AutoFixPlan> {
  return new Promise((resolve, reject) => {
    let worker: CompilationWorker | null = null;
    let settled = false;
    const settle = (plan: () => AutoFixPlan) => {
      if (settled) return;
      settled = true;
      try {
        worker?.terminate();
      } catch {
        // Termination is best effort; the plan below settles the request.
      }
      try {
        resolve(plan());
      } catch (cause) {
        reject(cause);
      }
    };
    try {
      const current = createWorker();
      worker = current;
      current.onmessage = (event) => settle(() => (isAutoFixPlan(event.data) ? event.data : fallback()));
      current.onerror = () => settle(fallback);
      current.onmessageerror = () => settle(fallback);
      current.postMessage({ autoFix: true, doc, snapToGrid });
    } catch {
      settle(fallback);
    }
  });
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
          this.fail("invalid-message", new Error("Invalid compiler worker response"), currentWorker, activeRequest);
          return;
        }
        if (
          !activeRequest ||
          data.id !== activeRequest.id ||
          data.source !== activeRequest.source ||
          data.snapToGrid !== activeRequest.snapToGrid
        ) {
          this.fail(
            "invalid-message",
            new Error("Compiler worker response does not match its active request"),
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
