import { useEffect, useRef, useState } from "react";

import { catalogIconUrl } from "@dumb-diagrams/runtime/catalog";
import { renderSvg } from "@dumb-diagrams/runtime/render";

import {
  cacheDiagramCompilation,
  compileDiagramSource,
  getCachedDiagramCompilation,
  type DiagramCompilation,
} from "../diagram-compiler";
import { DIAGRAM_EXAMPLES, type DiagramExample } from "../examples";
import { Modal } from "../ui/Modal";

type Preview = { status: "ready"; svg: string } | { status: "error" };

type CompilationResponse = {
  id: number;
  source: string;
  snapToGrid: boolean;
  compilation: DiagramCompilation;
};

function prepareForDisplay(
  source: string,
  snapToGrid: boolean,
  compilation: DiagramCompilation,
): Preview {
  if (!compilation.ok) return { status: "error" };
  try {
    // The worker's document base URI is not the page's base URI. Re-rendering
    // this final string on the UI thread keeps catalog icon URLs correct while
    // parse, layout, and routing stay off-thread.
    const prepared = {
      ...compilation,
      svg: renderSvg(compilation.doc, compilation.layout, {
        resolveIconHref: catalogIconUrl,
      }),
    };
    cacheDiagramCompilation(source, snapToGrid, prepared);
    return { status: "ready", svg: prepared.svg };
  } catch {
    return { status: "error" };
  }
}

export function ExamplesModal({
  open,
  onClose,
  onOpen,
  openingExampleId,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (example: DiagramExample) => void;
  openingExampleId: string | null;
}) {
  const [previews, setPreviews] = useState(() => new Map<string, Preview>());
  const previewsRef = useRef(previews);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let frame: number | null = null;
    let index = 0;
    let requestId = 0;
    let activeExample: DiagramExample | null = null;
    let worker: Worker | null = null;

    const updatePreview = (example: DiagramExample, preview: Preview) => {
      if (cancelled) return;
      setPreviews((current) => {
        const next = new Map(current);
        next.set(example.id, preview);
        previewsRef.current = next;
        return next;
      });
    };

    // Reuse both the in-memory card result and the shared compilation cache.
    // Reopening the modal therefore does not start another worker pass.
    const initial = new Map(previewsRef.current);
    for (const example of DIAGRAM_EXAMPLES) {
      if (initial.has(example.id)) continue;
      const cached = getCachedDiagramCompilation(example.source, true);
      if (cached) initial.set(example.id, cached.ok
        ? { status: "ready", svg: cached.svg }
        : { status: "error" });
    }
    previewsRef.current = initial;
    setPreviews(initial);
    const pending = DIAGRAM_EXAMPLES.filter((example) => !initial.has(example.id));

    let prepareNext: () => void;
    const finish = (example: DiagramExample, compilation: DiagramCompilation) => {
      if (cancelled) return;
      activeExample = null;
      updatePreview(example, prepareForDisplay(example.source, true, compilation));
      prepareNext();
    };

    const fallbackNext = (example: DiagramExample) => {
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (cancelled) return;
        finish(example, compileDiagramSource(example.source, true));
      });
    };

    prepareNext = () => {
      if (cancelled || index >= pending.length) return;
      const example = pending[index++]!;
      activeExample = example;
      if (!worker) {
        fallbackNext(example);
        return;
      }
      requestId += 1;
      try {
        worker.postMessage({ id: requestId, source: example.source, snapToGrid: true });
      } catch {
        worker.terminate();
        worker = null;
        fallbackNext(example);
      }
    };

    if (pending.length > 0 && typeof Worker !== "undefined") {
      try {
        worker = new Worker(
          new URL("../diagram-compiler.worker.ts", import.meta.url),
          { type: "module" },
        );
        worker.onmessage = (event: MessageEvent<CompilationResponse>) => {
          if (cancelled || event.data.id !== requestId || !activeExample) return;
          const example = activeExample;
          finish(example, event.data.compilation);
        };
        worker.onerror = () => {
          if (cancelled) return;
          worker?.terminate();
          worker = null;
          if (activeExample) fallbackNext(activeExample);
        };
      } catch {
        worker = null;
      }
    }

    // Let the modal paint its placeholders before the synchronous fallback.
    prepareNext();
    return () => {
      cancelled = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      worker?.terminate();
      worker = null;
    };
  }, [open]);

  const preparedCount = DIAGRAM_EXAMPLES.reduce(
    (count, example) => count + (previews.has(example.id) ? 1 : 0),
    0,
  );

  return (
    <Modal
      open={open}
      title="Browse examples"
      subtitle="Start from a real diagram and keep editing it in a new tab."
      onClose={onClose}
      className="examples-modal"
      width={820}
    >
      {DIAGRAM_EXAMPLES.length > 0 && (
        <div className="examples-progress" role="status" aria-live="polite">
          {preparedCount < DIAGRAM_EXAMPLES.length
            ? `Preparing previews ${preparedCount} of ${DIAGRAM_EXAMPLES.length}…`
            : "Previews ready"}
        </div>
      )}
      <div className="examples-grid">
        {DIAGRAM_EXAMPLES.length === 0 ? (
          <div className="examples-empty" role="status">
            No bundled examples are available yet.
          </div>
        ) : DIAGRAM_EXAMPLES.map((example) => {
          const preview = previews.get(example.id);
          const preparing = !preview;
          const opening = openingExampleId === example.id;
          return (
            <article key={example.id} className="example-card" aria-busy={preparing || opening}>
              <div className="example-preview" aria-label={`${example.title} preview`}>
                {preview?.status === "ready" ? (
                  <div dangerouslySetInnerHTML={{ __html: preview.svg }} />
                ) : preview?.status === "error" ? (
                  <span>Preview unavailable</span>
                ) : (
                  <div className="example-preview-skeleton" role="status" aria-label={`Preparing ${example.title} preview`}>
                    <span className="loading-spinner" aria-hidden="true" />
                    <span>Preparing preview…</span>
                  </div>
                )}
              </div>
              <div className="example-card-content">
                <div className="example-card-heading">
                  <div>
                    <h3>{example.title}</h3>
                    <p>{example.description}</p>
                  </div>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={preparing || openingExampleId !== null}
                    onClick={() => onOpen(example)}
                  >
                    {opening && <span className="loading-spinner is-small" aria-hidden="true" />}
                    {opening ? "Opening…" : preparing ? "Preparing…" : "Open"}
                  </button>
                </div>
                <div className="example-tags">
                  {example.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <details className="example-prompt">
                  <summary>Creation prompt</summary>
                  <pre>{example.prompt}</pre>
                </details>
              </div>
            </article>
          );
        })}
      </div>
    </Modal>
  );
}
