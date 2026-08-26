import { useEffect, useRef, useState } from "react";

import { catalogIconUrl } from "@dumb-diagrams/runtime/catalog";
import { renderSvg } from "@dumb-diagrams/runtime/render";

import {
  cacheDiagramCompilation,
  compileDiagramSource,
  getCachedDiagramCompilation,
  type DiagramCompilation,
} from "./diagram-compiler";

type CompilationResponse = {
  id: number;
  source: string;
  snapToGrid: boolean;
  compilation: DiagramCompilation;
};

const COMPILATION_DEBOUNCE_MS = 75;

function prepareForDisplay(compilation: DiagramCompilation): DiagramCompilation {
  if (!compilation.ok) return compilation;
  return {
    ...compilation,
    // Workers do not share document.baseURI. Rendering this inexpensive final
    // string on the UI thread keeps catalog URLs correct for both `/` and
    // sub-path deployments while layout and routing remain off-thread.
    svg: renderSvg(compilation.doc, compilation.layout, {
      resolveIconHref: catalogIconUrl,
    }),
  };
}

export function useDiagramCompilation(
  source: string,
  snapToGrid: boolean,
): DiagramCompilation {
  const [compilation, setCompilation] = useState<DiagramCompilation>(() =>
    compileDiagramSource(source, snapToGrid)
  );
  const workerRef = useRef<Worker | null>(null);
  const workerBusyRef = useRef(false);
  const restartWorkerRef = useRef<(() => Worker | null) | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const startWorker = (): Worker => {
      workerRef.current?.terminate();
      workerBusyRef.current = false;
      const worker = new Worker(
        new URL("./diagram-compiler.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<CompilationResponse>) => {
        if (workerRef.current !== worker) return;
        workerBusyRef.current = false;
        if (event.data.id !== requestIdRef.current) return;
        const prepared = prepareForDisplay(event.data.compilation);
        cacheDiagramCompilation(
          event.data.source,
          event.data.snapToGrid,
          prepared,
        );
        setCompilation(prepared);
      };
      return worker;
    };
    restartWorkerRef.current = startWorker;
    startWorker();
    return () => {
      workerRef.current?.terminate();
      restartWorkerRef.current = null;
      workerRef.current = null;
      workerBusyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const cached = getCachedDiagramCompilation(source, snapToGrid);
    if (cached) {
      requestIdRef.current += 1;
      if (workerBusyRef.current) restartWorkerRef.current?.();
      setCompilation(cached);
      return;
    }

    const id = requestIdRef.current + 1;
    requestIdRef.current = id;
    const timer = window.setTimeout(() => {
      if (id !== requestIdRef.current) return;
      let worker = workerRef.current;
      // A Worker cannot interrupt a route already in progress. Replacing a
      // busy instance keeps stale edits from forming an unbounded queue.
      if (worker && workerBusyRef.current) {
        worker = restartWorkerRef.current?.() ?? null;
      }
      if (worker) {
        workerBusyRef.current = true;
        worker.postMessage({ id, source, snapToGrid });
        return;
      }

      // Older embedded browsers still work; schedule the synchronous fallback
      // after the current interaction has painted.
      const prepared = prepareForDisplay(compileDiagramSource(source, snapToGrid));
      cacheDiagramCompilation(source, snapToGrid, prepared);
      setCompilation(prepared);
    }, COMPILATION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [snapToGrid, source]);

  return getCachedDiagramCompilation(source, snapToGrid) ?? compilation;
}
