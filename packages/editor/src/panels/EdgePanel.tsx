import type { Edge, EdgeKind, EdgeStyle } from "@dumb-diagrams/core";

export function EdgePanel({
  edge,
  routePinned,
  onUpdateEdge,
  onPinRoute,
  onAutoRoute,
  onSwapDirection,
  onDelete,
}: {
  edge: Edge;
  routePinned: boolean;
  onUpdateEdge: (style: EdgeStyle, kind: EdgeKind) => void;
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
