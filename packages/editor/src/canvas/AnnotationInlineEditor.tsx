import type { Ref } from "react";
import type { Annotation, Point, Rect } from "@dumb-diagrams/runtime/core";
import { DIAGRAM_LIMITS } from "@dumb-diagrams/runtime/core";
import { annotationTextLayout } from "@dumb-diagrams/runtime/render";

/** A transparent text surface inside the existing SVG note, in artboard coordinates. */
export function AnnotationInlineEditor({
  annotation,
  bounds,
  canvasOrigin,
  value,
  inputRef,
  onChange,
  onFinish,
  onCancel,
}: {
  annotation: Annotation;
  bounds: Rect;
  canvasOrigin: Point;
  value: string;
  inputRef: Ref<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onFinish: (value: string) => void;
  onCancel: () => void;
}) {
  const metrics = annotationTextLayout(annotation, bounds.w);
  const top = metrics.top - metrics.fontSize;
  const isText = annotation.style === "text";
  return (
    <textarea
      ref={inputRef}
      className="annotation-inline-editor"
      data-interactive="true"
      data-editing-annotation-id={annotation.id}
      aria-label="Edit note text"
      value={value}
      maxLength={DIAGRAM_LIMITS.annotationCharacters}
      style={{
        left: bounds.x - canvasOrigin.x + metrics.left,
        top: bounds.y - canvasOrigin.y + top,
        width: bounds.w - metrics.left - metrics.right,
        height: Math.max(metrics.lineHeight, bounds.h - top - 10),
        color:
          annotation.color ??
          (annotation.style === "code"
            ? "#d1fae5"
            : annotation.style === "checklist"
              ? "#2F6E56"
              : isText && !annotation.background
                ? "var(--annotation-ink)"
                : "#163964"),
        fontFamily: metrics.fontFamily,
        fontSize: metrics.fontSize,
        lineHeight: `${annotation.style === "checklist" ? metrics.rowHeight : metrics.lineHeight}px`,
        textAlign: annotation.align ?? "left",
      }}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onFinish(event.currentTarget.value);
        }
      }}
      onBlur={(event) => onFinish(event.currentTarget.value)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    />
  );
}
