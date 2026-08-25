import type { Edge, EdgeColor, EdgeKind, EdgeStyle } from "@dumb-diagrams/runtime/core";
import { DIAGRAM_LIMITS, EDGE_COLOR_VALUES, resolveEdgeColor } from "@dumb-diagrams/runtime/core";
import { useEffect, useState } from "react";

import { MAX_EDGE_STEP } from "../editor-model";
import { IconConnector } from "../ui/icons";

type EdgePatch = Partial<Pick<Edge, "style" | "kind">>;

const COLOR_OPTIONS: Array<{ id: EdgeColor; label: string; description: string }> = [
  { id: "graphite", label: "Graphite", description: "Neutral" },
  { id: "blue", label: "Blue", description: "Primary" },
  { id: "teal", label: "Teal", description: "Systems" },
  { id: "purple", label: "Purple", description: "Platform" },
  { id: "amber", label: "Amber", description: "Attention" },
  { id: "red", label: "Red", description: "Critical" },
  { id: "green", label: "Green", description: "Healthy" },
];

const MEANING_OPTIONS: Array<{
  id: EdgeKind;
  label: string;
  description: string;
}> = [
  { id: "flow", label: "Flow", description: "A directional path between components" },
  { id: "peer", label: "Peer", description: "A relationship without a direction" },
  { id: "fail", label: "Failure", description: "An error, retry, or exception path" },
];

const STYLE_OPTIONS: Array<{
  id: EdgeStyle;
  label: string;
  description: string;
}> = [
  { id: "solid", label: "Solid", description: "Primary connection" },
  { id: "dashed", label: "Dashed", description: "Secondary or conditional" },
];

export function EdgePanel({
  edge,
  routePinned,
  onUpdateLabel,
  onUpdateEdge,
  onUpdateColor,
  onUpdateStep,
  onPinRoute,
  onAutoRoute,
  onSwapDirection,
  onDelete,
}: {
  edge: Edge;
  routePinned: boolean;
  onUpdateLabel: (label: string) => void;
  onUpdateEdge: (patch: EdgePatch) => void;
  onUpdateColor: (color?: EdgeColor) => void;
  onUpdateStep: (step?: number) => void;
  onPinRoute: () => void;
  onAutoRoute: () => void;
  onSwapDirection: () => void;
  onDelete: () => void;
}) {
  const [labelDraft, setLabelDraft] = useState(edge.label ?? "");
  const [kindDraft, setKindDraft] = useState<EdgeKind>(edge.kind ?? "flow");
  const [styleDraft, setStyleDraft] = useState<EdgeStyle>(edge.style);
  const [colorDraft, setColorDraft] = useState<EdgeColor | undefined>(edge.color);
  const [stepDraft, setStepDraft] = useState<number | undefined>(edge.step);
  const [routePinnedDraft, setRoutePinnedDraft] = useState(routePinned);
  const meaning = MEANING_OPTIONS.find((option) => option.id === kindDraft) ?? MEANING_OPTIONS[0]!;
  const effectiveColor = resolveEdgeColor(colorDraft, kindDraft);

  useEffect(() => {
    setLabelDraft(edge.label ?? "");
    setKindDraft(edge.kind ?? "flow");
    setStyleDraft(edge.style);
    setColorDraft(edge.color);
    setStepDraft(edge.step);
    setRoutePinnedDraft(routePinned);
  }, [edge.color, edge.id, edge.kind, edge.label, edge.step, edge.style, routePinned]);

  const commitLabel = () => onUpdateLabel(labelDraft);

  return (
    <div className="edge-panel">
      <div className="edge-panel-intro">
        <div className="edge-panel-kicker">
          <span className="edge-panel-kicker-icon"><IconConnector /></span>
          <span>Connection</span>
          <span className="edge-panel-id">{edge.id}</span>
        </div>
        <div className="edge-panel-title-row">
          <div className="edge-panel-title-copy">
            <h3>{edge.label ?? edge.id}</h3>
            <p>
              <span>{edge.source}</span>
              <span className="edge-panel-direction" aria-hidden="true">→</span>
              <span>{edge.target}</span>
            </p>
          </div>
          <button
            className="edge-reverse-button"
            type="button"
            onClick={onSwapDirection}
            title="Reverse connector direction"
            aria-label="Reverse connector direction"
          >
            <span aria-hidden="true">↔</span>
            <small>Reverse</small>
          </button>
        </div>
      </div>

      <div className="edge-preview-card" aria-label={`Preview: ${meaning.label}, ${styleDraft}, ${colorDraft ? "custom color" : "automatic color"}`}>
        <EdgePreview color={effectiveColor} kind={kindDraft} style={styleDraft} />
        <div className="edge-preview-copy">
          <span>Live preview</span>
          <strong>{meaning.label}</strong>
        </div>
        <span className="edge-preview-style">{styleDraft}</span>
      </div>

      <section className="edge-panel-section edge-label-section">
        <div className="edge-section-heading">
          <div>
            <h4>Label</h4>
            <p>Give this connection a name people can scan.</p>
          </div>
          <span className="edge-section-optional">Optional</span>
        </div>
        <input
          id="edge-panel-label"
          className="edge-field"
          value={labelDraft}
          maxLength={DIAGRAM_LIMITS.labelCharacters}
          placeholder="Add a label"
          onChange={(event) => setLabelDraft(event.target.value)}
          onBlur={commitLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-describedby="edge-panel-label-hint"
        />
        <p id="edge-panel-label-hint" className="edge-help">
          Drag the label on the canvas to reposition it or switch sides.
        </p>
      </section>

      <section className="edge-panel-section">
        <div className="edge-section-heading">
          <div>
            <h4>Meaning</h4>
            <p>Sets the connector’s visual language and routing priority.</p>
          </div>
          <span className={`edge-kind-pill is-${meaning.id}`}>{meaning.label}</span>
        </div>
        <div className="edge-meaning-options" role="radiogroup" aria-label="Connector meaning">
          {MEANING_OPTIONS.map((option) => {
            const selected = meaning.id === option.id;
            return (
              <button
                key={option.id}
                className={`edge-meaning-option${selected ? " is-active" : ""}`}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setKindDraft(option.id);
                  onUpdateEdge({ kind: option.id });
                }}
              >
                <span className={`edge-meaning-glyph is-${option.id}`} aria-hidden="true">
                  {option.id === "flow" ? "→" : option.id === "peer" ? "↔" : "!"}
                </span>
                <span className="edge-option-copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                <span className="edge-option-check" aria-hidden="true">{selected ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="edge-panel-section">
        <div className="edge-section-heading">
          <div>
            <h4>Line</h4>
            <p>Choose how the path should read at a glance.</p>
          </div>
          <span className="edge-section-value">{styleDraft}</span>
        </div>
        <div className="edge-style-options" role="radiogroup" aria-label="Line style">
          {STYLE_OPTIONS.map((option) => {
            const selected = styleDraft === option.id;
            return (
              <button
                key={option.id}
                className={`edge-style-option${selected ? " is-active" : ""}`}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setStyleDraft(option.id);
                  onUpdateEdge({ style: option.id });
                }}
              >
                <span className={`edge-style-sample is-${option.id}`} aria-hidden="true"><i /></span>
                <span className="edge-option-copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                <span className="edge-option-check" aria-hidden="true">{selected ? "✓" : ""}</span>
              </button>
            );
          })}
        </div>

        <div className="edge-color-heading">
          <div>
            <h4>Color</h4>
            <p>{colorDraft ? "Custom color" : "Automatically follows the meaning"}</p>
          </div>
          <span className="edge-current-color">
            <i style={{ backgroundColor: effectiveColor }} aria-hidden="true" />
            {colorDraft ? COLOR_OPTIONS.find((option) => option.id === colorDraft)?.label : "Auto"}
          </span>
        </div>
        <div className="edge-color-options" role="radiogroup" aria-label="Connector color">
          <button
            className={`edge-color-option edge-color-auto${colorDraft === undefined ? " is-active" : ""}`}
            type="button"
            role="radio"
            aria-checked={colorDraft === undefined}
            onClick={() => {
              setColorDraft(undefined);
              onUpdateColor(undefined);
            }}
            title="Use the meaning-aware automatic color"
          >
            <span className="edge-color-swatch is-auto" aria-hidden="true" />
            <span>Auto</span>
          </button>
          {COLOR_OPTIONS.map((option) => {
            const selected = colorDraft === option.id;
            return (
              <button
                key={option.id}
                className={`edge-color-option${selected ? " is-active" : ""}`}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setColorDraft(option.id);
                  onUpdateColor(option.id);
                }}
                title={`${option.label}: ${option.description}`}
              >
                <span className="edge-color-swatch" style={{ backgroundColor: EDGE_COLOR_VALUES[option.id] }} aria-hidden="true" />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="edge-panel-section">
        <div className="edge-section-heading">
          <div>
            <h4>Sequence badge</h4>
            <p>Show a small step number on the connector.</p>
          </div>
          <span className="edge-section-optional">0–99</span>
        </div>
        <div className="edge-badge-editor">
          <input
            id="edge-panel-step"
            className="edge-field"
            aria-label="Sequence badge number"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_EDGE_STEP}
            step={1}
            placeholder="Add number"
            value={stepDraft ?? ""}
            onChange={(event) => {
              const raw = event.target.value;
              if (!raw) {
                setStepDraft(undefined);
                onUpdateStep(undefined);
                return;
              }
              if (!/^\d+$/.test(raw)) return;
              const value = Number(raw);
              if (Number.isSafeInteger(value) && value <= MAX_EDGE_STEP) {
                setStepDraft(value);
                onUpdateStep(value);
              }
            }}
          />
          <button
            className="edge-inline-action"
            type="button"
            onClick={() => {
              const nextStep = stepDraft === undefined ? 1 : undefined;
              setStepDraft(nextStep);
              onUpdateStep(nextStep);
            }}
          >
            {stepDraft === undefined ? "Add badge" : "Remove"}
          </button>
        </div>
        <p className="edge-help">Drag the badge along the connector to place it above or below the line.</p>
      </section>

      <section className="edge-panel-section edge-route-section">
        <div className="edge-section-heading">
          <div>
            <h4>Route</h4>
            <p>{routePinnedDraft ? "This path stays where you placed it." : "The layout engine chooses the cleanest path."}</p>
          </div>
          <span className={`edge-route-status${routePinnedDraft ? " is-pinned" : ""}`}>
            <i aria-hidden="true" />{routePinnedDraft ? "Pinned" : "Automatic"}
          </span>
        </div>
        <button
          className="edge-route-button"
          type="button"
          onClick={() => {
            setRoutePinnedDraft(!routePinnedDraft);
            if (routePinnedDraft) onAutoRoute();
            else onPinRoute();
          }}
        >
          <span className="edge-route-button-icon" aria-hidden="true">{routePinnedDraft ? "⌁" : "✦"}</span>
          <span className="edge-option-copy">
            <strong>{routePinnedDraft ? "Use automatic route" : "Pin current route"}</strong>
            <small>{routePinnedDraft ? "Let the diagram tidy this path again" : "Keep the current turns and bends"}</small>
          </span>
          <span className="edge-route-button-arrow" aria-hidden="true">→</span>
        </button>
      </section>

      <div className="edge-panel-footer">
        <button className="edge-delete-button" type="button" onClick={onDelete}>
          <span aria-hidden="true">⌫</span>
          Delete connector
        </button>
      </div>
    </div>
  );
}

function EdgePreview({ color, kind, style }: { color: string; kind: EdgeKind; style: EdgeStyle }) {
  return (
    <svg className="edge-preview-graphic" viewBox="0 0 112 34" aria-hidden="true">
      <line
        x1="8"
        y1="17"
        x2="103"
        y2="17"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={style === "dashed" ? "8 6" : undefined}
      />
      {kind === "peer" ? (
        <>
          <circle cx="8" cy="17" r="4" fill="white" stroke={color} strokeWidth="2" />
          <circle cx="103" cy="17" r="4" fill="white" stroke={color} strokeWidth="2" />
        </>
      ) : (
        <path d="M103 10L112 17L103 24Z" fill={color} />
      )}
    </svg>
  );
}
