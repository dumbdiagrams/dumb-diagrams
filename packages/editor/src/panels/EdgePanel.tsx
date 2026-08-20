import type { Edge, EdgeKind, EdgeStyle } from "@dumb-diagrams/core";

export function EdgePanel({
  edge,
  routePinned,
  onUpdateEdge,
  onUpdateStep,
  onPinRoute,
  onAutoRoute,
  onSwapDirection,
  onDelete,
}: {
  edge: Edge;
  routePinned: boolean;
  onUpdateEdge: (style: EdgeStyle, kind: EdgeKind) => void;
  onUpdateStep: (step?: number) => void;
  onPinRoute: () => void;
  onAutoRoute: () => void;
  onSwapDirection: () => void;
  onDelete: () => void;
}) {
  const label = edge.label ?? edge.id;

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
        {edge.step === undefined ? (
          <button
            className="wide-button"
            id="edge-panel-step"
            type="button"
            onClick={() => onUpdateStep(1)}
          >
            Add number badge
          </button>
        ) : (
          <div className="edge-badge-editor">
            <input
              id="edge-panel-step"
              aria-label="Arrow number"
              type="number"
              inputMode="numeric"
              min={0}
              max={9999}
              step={1}
              value={edge.step}
              onChange={(event) => {
                const raw = event.target.value;
                if (!raw) {
                  onUpdateStep(undefined);
                  return;
                }
                if (!/^\d+$/.test(raw)) return;
                const value = Number(raw);
                if (Number.isSafeInteger(value) && value <= 9999) onUpdateStep(value);
              }}
            />
            <button
              className="text-button"
              type="button"
              onClick={() => onUpdateStep(undefined)}
            >
              Remove
            </button>
          </div>
        )}
        <p className="property-hint">Drag the badge along the connector to place it above or below the line.</p>
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
