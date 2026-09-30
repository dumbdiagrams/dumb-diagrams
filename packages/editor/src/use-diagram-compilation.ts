import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { catalogIconUrl } from "@dumb-diagrams/runtime/catalog";
import { renderSvg, validateEmbeddedAssets } from "@dumb-diagrams/runtime/render";

import {
  cacheDiagramCompilation,
  compileDiagramSource,
  compilationFailure,
  getCachedDiagramCompilation,
  getCommittedCompilationEpoch,
  isDeferredCompilation,
  type DiagramCompilation,
} from "./diagram-compiler";
import {
  DiagramCompilerWorkerClient,
  type CompilationRequest,
  type CompilationResponse,
} from "./diagram-compiler-worker-client";

const COMPILATION_DEBOUNCE_MS = 75;

function compileForDisplay(source: string, snapToGrid: boolean): DiagramCompilation {
  try {
    return prepareForDisplay(compileDiagramSource(source, snapToGrid));
  } catch (error) {
    console.error("Synchronous diagram compilation failed", error);
    return compilationFailure([], error, "prepare");
  }
}

function prepareForDisplay(compilation: DiagramCompilation): DiagramCompilation {
  if (!compilation.ok) return compilation;
  try {
    const assetIssues = validateEmbeddedAssets(compilation.doc);
    if (assetIssues.length > 0) {
      return {
        ok: false,
        issues: [...compilation.issues, ...assetIssues],
        svg: null,
        layout: null,
        invariantFailures: [],
      };
    }
    return {
      ...compilation,
      // Workers do not share document.baseURI. Rendering this inexpensive final
      // string on the UI thread keeps catalog URLs correct for both `/` and
      // sub-path deployments while layout and routing remain off-thread.
      svg: renderSvg(compilation.doc, compilation.layout, {
        resolveIconHref: catalogIconUrl,
      }),
    };
  } catch (error) {
    return compilationFailure(compilation.issues, error, "render");
  }
}

export function useDiagramCompilation(
  source: string,
  snapToGrid: boolean,
): { compilation: DiagramCompilation; pending: boolean } {
  const [compilation, setCompilation] = useState<DiagramCompilation>(() =>
    compileForDisplay(source, snapToGrid)
  );
  const workerClientRef = useRef<DiagramCompilerWorkerClient | null>(null);
  const requestIdRef = useRef(0);
  const committedEpochRef = useRef(getCommittedCompilationEpoch());
  const committedEpoch = getCommittedCompilationEpoch();

  const invalidateInFlightCompilation = () => {
    requestIdRef.current += 1;
    if (workerClientRef.current?.isBusy()) workerClientRef.current.restart();
  };

  const compileSynchronously = (request: CompilationRequest) => {
    const prepared = compileForDisplay(request.source, request.snapToGrid);
    cacheDiagramCompilation(request.source, request.snapToGrid, prepared);
    if (request.id === requestIdRef.current) setCompilation(prepared);
  };

  useLayoutEffect(() => {
    if (committedEpoch === committedEpochRef.current) return;
    committedEpochRef.current = committedEpoch;
    invalidateInFlightCompilation();
    const cached = getCachedDiagramCompilation(source, snapToGrid);
    if (cached) setCompilation(cached);
  }, [committedEpoch, snapToGrid, source]);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const workerClient = new DiagramCompilerWorkerClient({
      createWorker: () =>
        new Worker(new URL("./diagram-compiler.worker.ts", import.meta.url), {
          type: "module",
        }),
      onResponse: (response: CompilationResponse) => {
        if (response.id !== requestIdRef.current) return;
        const prepared = prepareForDisplay(response.compilation);
        cacheDiagramCompilation(response.source, response.snapToGrid, prepared);
        setCompilation(prepared);
      },
      onFailure: (request, failure) => {
        console.error("Diagram compiler worker failed", failure.kind, failure.error);
        if (request && request.id === requestIdRef.current) compileSynchronously(request);
      },
    });
    workerClientRef.current = workerClient;
    workerClient.start();
    return () => {
      workerClient.dispose();
      if (workerClientRef.current === workerClient) workerClientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cached = getCachedDiagramCompilation(source, snapToGrid);
    if (cached) {
      invalidateInFlightCompilation();
      setCompilation(cached);
      return;
    }

    const id = requestIdRef.current + 1;
    requestIdRef.current = id;
    const timer = window.setTimeout(() => {
      if (id !== requestIdRef.current) return;
      // A Worker cannot interrupt a route already in progress. Replacing a
      // busy instance keeps stale edits from forming an unbounded queue.
      const request = { id, source, snapToGrid };
      const workerClient = workerClientRef.current;
      if (workerClient) {
        if (workerClient.isBusy()) workerClient.restart();
        workerClient.request(request);
        return;
      }

      // Older embedded browsers still work; schedule the synchronous fallback
      // after the current interaction has painted.
      compileSynchronously(request);
    }, isDeferredCompilation(source, snapToGrid) ? 0 : COMPILATION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [snapToGrid, source]);

  const cached = getCachedDiagramCompilation(source, snapToGrid);
  return {
    compilation: cached ?? compilation,
    pending: !cached,
  };
}
