/// <reference lib="webworker" />

import { compileDiagramSource } from "./diagram-compiler";

type CompilationRequest = {
  id: number;
  source: string;
  snapToGrid: boolean;
};

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
