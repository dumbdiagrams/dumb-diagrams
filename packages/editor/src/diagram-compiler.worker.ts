/// <reference lib="webworker" />

import { planAutoFix } from "./auto-fix";
import { compileDiagramSource } from "./diagram-compiler";
import type { AutoFixRequest, CompilationRequest } from "./diagram-compiler-worker-client";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<CompilationRequest | AutoFixRequest>) => {
  const request = event.data;
  if ("autoFix" in request) {
    self.postMessage(planAutoFix(request.doc, request.snapToGrid));
    return;
  }
  const { id, source, snapToGrid } = request;
  self.postMessage({
    id,
    source,
    snapToGrid,
    compilation: compileDiagramSource(source, snapToGrid),
  });
};

export {};
