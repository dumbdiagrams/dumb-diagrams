/// <reference lib="webworker" />

import { compileDiagramSource } from "./diagram-compiler";
import type { CompilationRequest } from "./diagram-compiler-worker-client";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<CompilationRequest>) => {
  const { id, source, snapToGrid } = event.data;
  self.postMessage({
    id,
    source,
    snapToGrid,
    compilation: compileDiagramSource(source, snapToGrid),
  });
};

export {};
