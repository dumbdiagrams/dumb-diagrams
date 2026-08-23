import { useEffect, useState } from "react";

import { compileDiagramSource, getCachedDiagramCompilation } from "../diagram-compiler";
import { DIAGRAM_EXAMPLES, type DiagramExample } from "../examples";
import { Modal } from "../ui/Modal";

type Preview = { status: "ready"; svg: string } | { status: "error" };

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

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let frame = 0;
    let index = 0;

    const prepareNext = () => {
      if (cancelled || index >= DIAGRAM_EXAMPLES.length) return;
      const example = DIAGRAM_EXAMPLES[index++]!;
      const compilation = getCachedDiagramCompilation(example.source, true)
        ?? compileDiagramSource(example.source, true);
      if (cancelled) return;
      setPreviews((current) => {
        const next = new Map(current);
        next.set(example.id, compilation.ok
          ? { status: "ready", svg: compilation.svg }
          : { status: "error" });
        return next;
      });
      frame = window.requestAnimationFrame(prepareNext);
    };

    // Give the modal and its loading placeholders a frame to paint before the
    // first layout/route/render pass, then prepare one card per frame.
    frame = window.requestAnimationFrame(prepareNext);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  return (
    <Modal
      open={open}
      title="Browse examples"
      subtitle="Start from a real diagram and keep editing it in a new tab."
      onClose={onClose}
      className="examples-modal"
      width={820}
    >
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
