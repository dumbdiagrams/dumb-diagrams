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
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    const worker = new Worker(
      new URL("./diagram-compiler.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<CompilationResponse>) => {
      if (event.data.id !== requestIdRef.current) return;
      const prepared = prepareForDisplay(event.data.compilation);
      cacheDiagramCompilation(
        event.data.source,
        event.data.snapToGrid,
        prepared,
      );
      setCompilation(prepared);
    };
    return () => {
      workerRef.current = null;
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    const cached = getCachedDiagramCompilation(source, snapToGrid);
    if (cached) {
      requestIdRef.current += 1;
      setCompilation(cached);
      return;
    }

    const id = requestIdRef.current + 1;
    requestIdRef.current = id;
    const worker = workerRef.current;
    if (worker) {
      worker.postMessage({ id, source, snapToGrid });
      return;
    }

    // Older embedded browsers still work; schedule the synchronous fallback
    // after the current interaction has painted.
    const timer = window.setTimeout(() => {
      if (id !== requestIdRef.current) return;
      const prepared = prepareForDisplay(compileDiagramSource(source, snapToGrid));
      cacheDiagramCompilation(source, snapToGrid, prepared);
      setCompilation(prepared);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [snapToGrid, source]);

  return compilation;
}
