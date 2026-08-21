import { useMemo } from "react";

import { catalogIconUrl } from "@dumb-diagrams/catalog";
import { parseDgm } from "@dumb-diagrams/dsl";
import { layoutDocument } from "@dumb-diagrams/layout";
import { renderSvg } from "@dumb-diagrams/render";
import { attachRoutes, routeEdges } from "@dumb-diagrams/route";

import { DIAGRAM_EXAMPLES, type DiagramExample } from "../examples";
import { Modal } from "../ui/Modal";

export function ExamplesModal({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (example: DiagramExample) => void;
}) {
  const previews = useMemo(() => new Map(
    DIAGRAM_EXAMPLES.map((example) => {
      try {
        const doc = parseDgm(example.source);
        const placedLayout = layoutDocument(doc);
        const layout = attachRoutes(placedLayout, routeEdges(doc, placedLayout));
        return [example.id, renderSvg(doc, layout, { resolveIconHref: catalogIconUrl })] as const;
      } catch {
        return [example.id, ""] as const;
      }
    }),
  ), []);

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
        {DIAGRAM_EXAMPLES.map((example) => (
          <article key={example.id} className="example-card">
            <div className="example-preview" aria-label={`${example.title} preview`}>
              {previews.get(example.id) ? (
                <div dangerouslySetInnerHTML={{ __html: previews.get(example.id)! }} />
              ) : (
                <span>Preview unavailable</span>
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
                  onClick={() => onOpen(example)}
                >
                  Open
                </button>
              </div>
              <div className="example-tags">
                {example.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            </div>
          </article>
        ))}
      </div>
    </Modal>
  );
}
