import type { Edge, EdgeKind, EdgeStyle } from "@dumb-diagrams/core";
import { DIAGRAM_LIMITS } from "@dumb-diagrams/core";
import { useEffect, useState } from "react";

import { MAX_EDGE_STEP } from "../editor-model";

export function EdgePanel({
  edge,
  routePinned,
  onUpdateLabel,
  onUpdateEdge,
  onUpdateStep,
  onPinRoute,
  onAutoRoute,
  onSwapDirection,
  onDelete,
}: {
  edge: Edge;
  routePinned: boolean;
  onUpdateLabel: (label: string) => void;
  onUpdateEdge: (style: EdgeStyle, kind: EdgeKind) => void;
  onUpdateStep: (step?: number) => void;
  onPinRoute: () => void;
  onAutoRoute: () => void;
  onSwapDirection: () => void;
  onDelete: () => void;
}) {
  const label = edge.label ?? edge.id;
  const [labelDraft, setLabelDraft] = useState(edge.label ?? "");

  useEffect(() => {
    setLabelDraft(edge.label ?? "");
  }, [edge.id, edge.label]);

  const commitLabel = () => onUpdateLabel(labelDraft);

  return (
    <div className="edge-panel">
      <div className="edge-panel-header">
        <h3>{label}</h3>
        <p>{edge.source} → {edge.target}</p>
        <button className="wide-button edge-swap-button" type="button" onClick={onSwapDirection}>
          Swap direction
        </button>
      </div>

      <div className="property-section">
        <label htmlFor="edge-panel-label">Connector label</label>
        <input
          id="edge-panel-label"
          value={labelDraft}
          maxLength={DIAGRAM_LIMITS.labelCharacters}
          placeholder="Optional label"
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-describedby="edge-panel-label-hint"
        />
        <p id="edge-panel-label-hint" className="property-hint">
          Edit the text, or drag its label along the connector and across the line to switch sides.
        </p>
      </div>

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
        <label htmlFor="edge-panel-kind">Meaning</label>
        <select
          id="edge-panel-kind"
          value={edge.kind ?? "flow"}
          onChange={(event) =>
            onUpdateEdge(edge.style, event.target.value as EdgeKind)
          }
        >
          <option value="flow">Flow</option>
          <option value="peer">Peer</option>
          <option value="fail">Failure</option>
        </select>
      </div>

      <div className="property-section">
        <label htmlFor="edge-panel-step">Arrow number</label>
        <div className="edge-badge-editor">
          <input
            id="edge-panel-step"
            aria-label="Arrow number"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_EDGE_STEP}
            step={1}
            placeholder="Add number"
            value={edge.step ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              if (!raw) {
                onUpdateStep(undefined);
                return;
              }
              if (!/^\d+$/.test(raw)) return;
              const value = Number(raw);
              if (Number.isSafeInteger(value) && value <= MAX_EDGE_STEP) onUpdateStep(value);
            }}
          />
          <button
            className="text-button"
            type="button"
            onClick={() => onUpdateStep(edge.step === undefined ? 1 : undefined)}
          >
            {edge.step === undefined ? "Add" : "Remove"}
          </button>
        </div>
        <p className="property-hint">Whole numbers only: 0–99. Drag the badge along the connector to place it above or below the line.</p>
      </div>

      <div className="property-section">
        <label>Route</label>
        <button
          className="wide-button"
          type="button"
          onClick={routePinned ? onAutoRoute : onPinRoute}
        >
          {routePinned ? "Use auto route" : "Pin current route"}
        </button>
      </div>

      <div className="edge-panel-footer">
        <button className="danger-button" type="button" onClick={onDelete}>
          Delete connector
        </button>
      </div>
    </div>
  );
}
