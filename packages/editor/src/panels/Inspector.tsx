import { useEffect, useState } from "react";
import type {
  DiagramDocument,
  LayoutResult,
  AnnotationStyle,
  BoundaryFill,
  EdgeStyle,
  EdgeKind,
  EdgeColor,
  ResourceLabelPosition,
  GroupLabelPosition,
  TextFontFamily,
  TextAlign,
} from "@dumb-diagrams/runtime/core";
import { DIAGRAM_LIMITS, characterLength, EDGE_COLOR_VALUES } from "@dumb-diagrams/runtime/core";
import { getCatalogEntry } from "@dumb-diagrams/runtime/catalog";
import { GRAMMAR } from "@dumb-diagrams/runtime/grammar-aws";
import {
  primarySelection,
  annotationStyle,
  resourceIconSize,
  MAX_EDGE_STEP,
  type ResourceIconSize,
} from "../editor-model";
import type { Selection, SelectionItem } from "../model/types";
import { FloatingPanel } from "../ui/FloatingPanel";
import { rejectOversizedPaste } from "../ui/text-input";
import { TextFormattingControls, NoteStyleOptions } from "./AnnotationControls";

const INSPECTOR_KIND_LABELS: Record<SelectionItem["kind"], string> = {
  resource: "Service",
  group: "Boundary",
  edge: "Connection",
  annotation: "Note",
};

const BOUNDARY_COLOR_OPTIONS: Array<{ id: EdgeColor; label: string }> = [
  { id: "graphite", label: "Navy" },
  { id: "blue", label: "Slate" },
  { id: "teal", label: "Teal" },
  { id: "purple", label: "Purple" },
  { id: "amber", label: "Orange" },
  { id: "coral", label: "Coral" },
  { id: "red", label: "Red" },
  { id: "green", label: "Green" },
];

export function Inspector({
  doc,
  layout,
  selection,
  onRename,
  onLimitError,
  onAlign,
  onDistribute,
  onSetIconSize,
  onSetResourceLabelPosition,
  onSetGroupLabelPosition,
  onSetGroupIconHidden,
  onSetBoundaryAppearance,
  onSetAnnotationStyle,
  onSetTextFormat,
  onUpdateGroupStep,
  onUpdateEdge,
  onPinRoute,
  onAutoRoute,
  onDelete,
  onClose,
}: {
  doc: DiagramDocument;
  layout: LayoutResult;
  selection: Selection;
  onRename: (label: string) => void;
  onLimitError: (message: string) => void;
  onAlign: (axis: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onSetIconSize: (size: ResourceIconSize) => void;
  onSetResourceLabelPosition: (position: ResourceLabelPosition) => void;
  onSetGroupLabelPosition: (position: GroupLabelPosition) => void;
  onSetGroupIconHidden: (hidden: boolean) => void;
  onSetBoundaryAppearance: (patch: { style?: EdgeStyle; color?: EdgeColor; fill?: BoundaryFill }) => void;
  onSetAnnotationStyle: (style: AnnotationStyle) => void;
  onSetTextFormat: (format: { font?: TextFontFamily; fontSize?: number; align?: TextAlign }) => void;
  onUpdateGroupStep: (step?: number) => void;
  onUpdateEdge: (style: EdgeStyle, kind: EdgeKind) => void;
  onPinRoute: () => void;
  onAutoRoute: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const item = primarySelection(selection);
  const edge = item?.kind === "edge" ? doc.edges.find((candidate) => candidate.id === item.id) : undefined;
  const resource = item?.kind === "resource" ? doc.resources.find((candidate) => candidate.id === item.id) : undefined;
  const group = item?.kind === "group" ? doc.groups.find((candidate) => candidate.id === item.id) : undefined;
  const canHideGroupIcon = Boolean(
    group?.type &&
      group.type !== "cloud-agnostic.boundary" &&
      getCatalogEntry(group.type)?.provider === "cloud-agnostic",
  );
  const annotation =
    item?.kind === "annotation" ? doc.annotations.find((candidate) => candidate.id === item.id) : undefined;
  const routePinned = Boolean(item && doc.views[0]?.routes[item.id]?.pin);

  const resourceServiceLabel = resource
    ? layout.nodes.find((candidate) => candidate.id === resource.id)?.serviceLabel
    : undefined;
  const title =
    resource?.label.role ??
    resource?.label.service ??
    resourceServiceLabel ??
    group?.label ??
    edge?.label ??
    annotation?.text ??
    edge?.id ??
    item?.id ??
    `${selection.length} selected`;

  const editableLabel = resource ? (resource.label.role ?? "") : title;
  const [labelDraft, setLabelDraft] = useState(editableLabel);
  useEffect(() => setLabelDraft(editableLabel), [editableLabel]);
  const authoredResourceLabelPosition: ResourceLabelPosition = resource?.label.position === "top" ? "top" : "bottom";
  const [resourceLabelPositionDraft, setResourceLabelPositionDraft] =
    useState<ResourceLabelPosition>(authoredResourceLabelPosition);
  useEffect(() => {
    setResourceLabelPositionDraft(authoredResourceLabelPosition);
  }, [resource?.id, authoredResourceLabelPosition]);
  const authoredResourceIconSize = resource ? resourceIconSize(resource) : "normal";
  const [resourceIconSizeDraft, setResourceIconSizeDraft] = useState<ResourceIconSize>(authoredResourceIconSize);
  useEffect(() => {
    setResourceIconSizeDraft(authoredResourceIconSize);
  }, [resource?.id, authoredResourceIconSize]);
  const authoredGroupLabelPosition: GroupLabelPosition = group?.labelPosition?.endsWith("right")
    ? "top-right"
    : "top-left";
  const [groupLabelPositionDraft, setGroupLabelPositionDraft] =
    useState<GroupLabelPosition>(authoredGroupLabelPosition);
  useEffect(() => {
    setGroupLabelPositionDraft(authoredGroupLabelPosition);
  }, [group?.id, authoredGroupLabelPosition]);

  return (
    <FloatingPanel
      className="inspector-sheet"
      title={title}
      subtitle={
        selection.length > 1
          ? `${selection.length} selected`
          : item
            ? item.kind === "annotation" && annotation && annotationStyle(annotation) === "text"
              ? "Text"
              : INSPECTOR_KIND_LABELS[item.kind]
            : "Selection"
      }
      onClose={onClose}
      width={280}
    >
      {selection.length > 1 && (
        <div className="property-section">
          <label>Alignment</label>
          <div className="button-grid">
            <button type="button" onClick={() => onAlign("left")}>
              Left
            </button>
            <button type="button" onClick={() => onAlign("center")}>
              Center
            </button>
            <button type="button" onClick={() => onAlign("right")}>
              Right
            </button>
            <button type="button" onClick={() => onAlign("top")}>
              Top
            </button>
            <button type="button" onClick={() => onAlign("middle")}>
              Middle
            </button>
            <button type="button" onClick={() => onAlign("bottom")}>
              Bottom
            </button>
          </div>
          <div className="button-pair">
            <button type="button" onClick={() => onDistribute("horizontal")}>
              Distribute H
            </button>
            <button type="button" onClick={() => onDistribute("vertical")}>
              Distribute V
            </button>
          </div>
        </div>
      )}
      {(resource || group || edge || annotation) && (
        <div className="property-section">
          <label htmlFor="inspector-label">{annotation ? "Content" : "Display label"}</label>
          {annotation ? (
            <textarea
              id="inspector-label"
              value={labelDraft}
              maxLength={DIAGRAM_LIMITS.annotationCharacters}
              rows={5}
              onChange={(event) => setLabelDraft(event.target.value)}
              onPaste={(event) =>
                rejectOversizedPaste(event, DIAGRAM_LIMITS.annotationCharacters, () =>
                  onLimitError(`Notes are limited to ${DIAGRAM_LIMITS.annotationCharacters} characters`),
                )
              }
              onBlur={() => onRename(labelDraft)}
              aria-describedby="inspector-label-limit"
            />
          ) : (
            <input
              id="inspector-label"
              value={labelDraft}
              placeholder={resource ? "Optional label" : undefined}
              maxLength={DIAGRAM_LIMITS.labelCharacters}
              onChange={(event) => setLabelDraft(event.target.value)}
              onPaste={(event) =>
                rejectOversizedPaste(event, DIAGRAM_LIMITS.labelCharacters, () =>
                  onLimitError(`Labels are limited to ${DIAGRAM_LIMITS.labelCharacters} characters`),
                )
              }
              onBlur={() => onRename(labelDraft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              aria-describedby="inspector-label-limit"
            />
          )}
          <span id="inspector-label-limit" className="input-limit" aria-live="polite">
            {characterLength(labelDraft)} /{" "}
            {annotation ? DIAGRAM_LIMITS.annotationCharacters : DIAGRAM_LIMITS.labelCharacters}
          </span>
        </div>
      )}
      {annotation && (
        <div className="property-section">
          <label>Note style</label>
          <NoteStyleOptions selectedStyle={annotationStyle(annotation)} onStyleChange={onSetAnnotationStyle} />
        </div>
      )}
      {annotation && annotationStyle(annotation) === "text" && (
        <TextFormattingControls
          idPrefix="inspector"
          font={annotation.font ?? "sans"}
          fontSize={annotation.fontSize ?? 14}
          align={annotation.align ?? "left"}
          onChange={onSetTextFormat}
        />
      )}
      {resource && (
        <div className="property-section">
          <label>Icon size</label>
          <div className="button-pair">
            <button
              type="button"
              className={resourceIconSizeDraft === "normal" ? "is-active" : ""}
              onClick={() => {
                setResourceIconSizeDraft("normal");
                onSetIconSize("normal");
              }}
            >
              Normal ({GRAMMAR.iconPrimary}px)
            </button>
            <button
              type="button"
              className={resourceIconSizeDraft === "small" ? "is-active" : ""}
              onClick={() => {
                setResourceIconSizeDraft("small");
                onSetIconSize("small");
              }}
            >
              Small ({GRAMMAR.iconSecondary}px)
            </button>
          </div>
        </div>
      )}
      {resource && (
        <div className="property-section">
          <label htmlFor="resource-label-position">Display label position</label>
          <select
            id="resource-label-position"
            value={resourceLabelPositionDraft}
            onChange={(event) => {
              const position = event.target.value as ResourceLabelPosition;
              setResourceLabelPositionDraft(position);
              onSetResourceLabelPosition(position);
            }}
          >
            <option value="top">Above icon</option>
            <option value="bottom">Below icon</option>
          </select>
          <p className="property-hint">
            Automatic connectors avoid the side occupied by the label unless a straight line to an aligned icon fits.
          </p>
        </div>
      )}
      {group && (
        <div className="property-section">
          <label htmlFor="group-label-position">Display label position</label>
          <select
            id="group-label-position"
            value={groupLabelPositionDraft}
            onChange={(event) => {
              const position = event.target.value as GroupLabelPosition;
              setGroupLabelPositionDraft(position);
              onSetGroupLabelPosition(position);
            }}
          >
            <option value="top-left">Top left</option>
            <option value="top-right">Top right</option>
          </select>
        </div>
      )}
      {group && (
        <div className="property-section boundary-appearance-section">
          <label>Boundary line</label>
          <div className="button-pair" role="radiogroup" aria-label="Boundary line style">
            {(["solid", "dashed"] as EdgeStyle[]).map((style) => {
              const inheritedStyle = ["region", "az", "logical", "overlay"].includes(group.kind) ? "dashed" : "solid";
              const selected = (group.style ?? inheritedStyle) === style;
              return (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? "is-active" : ""}
                  onClick={() => onSetBoundaryAppearance({ style })}
                >
                  {style === "solid" ? "Solid" : "Dashed"}
                </button>
              );
            })}
          </div>
          <label>Boundary color</label>
          <div className="edge-color-options boundary-color-options" role="radiogroup" aria-label="Boundary color">
            <button
              className={`edge-color-option edge-color-auto${group.color === undefined ? " is-active" : ""}`}
              type="button"
              role="radio"
              aria-checked={group.color === undefined}
              onClick={() => onSetBoundaryAppearance({ color: undefined })}
              title="Use the boundary type's default color"
            >
              <span className="edge-color-swatch is-auto" aria-hidden="true" />
              <span>Default</span>
            </button>
            {BOUNDARY_COLOR_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`edge-color-option${group.color === option.id ? " is-active" : ""}`}
                type="button"
                role="radio"
                aria-checked={group.color === option.id}
                onClick={() => onSetBoundaryAppearance({ color: option.id })}
                title={option.label}
              >
                <span
                  className="edge-color-swatch"
                  style={{ backgroundColor: EDGE_COLOR_VALUES[option.id] }}
                  aria-hidden="true"
                />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
          <label>Interior fill</label>
          <div className="button-pair" role="radiogroup" aria-label="Boundary fill">
            {(["subtle", "none"] as BoundaryFill[]).map((fill) => {
              const selected = (group.fill ?? "subtle") === fill;
              return (
                <button
                  key={fill}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={selected ? "is-active" : ""}
                  onClick={() => onSetBoundaryAppearance({ fill })}
                >
                  {fill === "subtle" ? "Subtle" : "None"}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {group && canHideGroupIcon && (
        <div className="property-section">
          <label>Boundary icon</label>
          <div className="button-pair">
            <button
              type="button"
              className={group.hideIcon ? "" : "is-active"}
              onClick={() => onSetGroupIconHidden(false)}
            >
              Show icon
            </button>
            <button
              type="button"
              className={group.hideIcon ? "is-active" : ""}
              onClick={() => onSetGroupIconHidden(true)}
            >
              Hide icon
            </button>
          </div>
          <p className="property-hint">Hide the semantic icon while keeping this boundary type.</p>
        </div>
      )}
      {group && (
        <div className="property-section">
          <label htmlFor="group-step">Boundary number</label>
          <div className="edge-badge-editor">
            <input
              id="group-step"
              aria-label="Boundary number"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_EDGE_STEP}
              step={1}
              placeholder="Add number"
              value={group.step ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                if (!raw) return onUpdateGroupStep(undefined);
                if (!/^\d+$/.test(raw)) return;
                const value = Number(raw);
                if (Number.isSafeInteger(value) && value <= MAX_EDGE_STEP) onUpdateGroupStep(value);
              }}
            />
            <button
              className="text-button"
              type="button"
              onClick={() => onUpdateGroupStep(group.step === undefined ? 1 : undefined)}
            >
              {group.step === undefined ? "Add" : "Remove"}
            </button>
          </div>
          <p className="property-hint">Whole numbers only: 0–99.</p>
        </div>
      )}
      {group && (
        <details className="inspector-advanced">
          <summary>Advanced details</summary>
          <div className="inspector-advanced-body">
            <div className="inspector-detail">
              <span className="inspector-detail-label">Boundary kind</span>
              <div className="readonly-value">{group.kind}</div>
            </div>
            <div className="inspector-detail">
              <span className="inspector-detail-label">Children</span>
              <div className="readonly-value">{group.children.length}</div>
            </div>
          </div>
        </details>
      )}
      {resource && (
        <details className="inspector-advanced">
          <summary>Advanced details</summary>
          <div className="inspector-advanced-body">
            <div className="inspector-detail">
              <span className="inspector-detail-label">Resource type</span>
              <code className="readonly-value">{resource.type}</code>
            </div>
            <div className="inspector-detail">
              <span className="inspector-detail-label">Parent group</span>
              <div className="readonly-value">
                {resource.parent
                  ? (doc.groups.find((candidate) => candidate.id === resource.parent)?.label ?? resource.parent)
                  : "Canvas"}
              </div>
            </div>
          </div>
        </details>
      )}
      {edge && (
        <>
          <div className="property-section">
            <label>Line style</label>
            <div className="button-pair">
              {(["solid", "dashed"] as EdgeStyle[]).map((style) => (
                <button
                  key={style}
                  className={edge.style === style ? "is-active" : ""}
                  type="button"
                  onClick={() => onUpdateEdge(style, edge.kind ?? "flow")}
                >
                  {style}
                </button>
              ))}
            </div>
            <label htmlFor="edge-kind">Meaning</label>
            <select
              id="edge-kind"
              value={edge.kind ?? "flow"}
              onChange={(event) => onUpdateEdge(edge.style, event.target.value as EdgeKind)}
            >
              <option value="flow">Flow</option>
              <option value="bidirectional">Bidirectional</option>
              <option value="peer">Peer</option>
              <option value="fail">Failure</option>
            </select>
          </div>
          <div className="property-section">
            <label>Route</label>
            <button className="wide-button" type="button" onClick={routePinned ? onAutoRoute : onPinRoute}>
              {routePinned ? "Use auto route" : "Pin current route"}
            </button>
          </div>
        </>
      )}
      <div className="inspector-footer">
        <button className="danger-button" type="button" onClick={onDelete}>
          Delete
        </button>
      </div>
    </FloatingPanel>
  );
}
