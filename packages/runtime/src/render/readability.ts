import { type DiagramDocument, type ID, isPrimaryFlowEdge as isFlow, type LayoutResult } from "../core/index.js";
import type { InvariantFailure } from "./invariants.js";

export interface ReadabilityMetrics {
  /** Solid flow and bidirectional edges; failure, peer, and dashed edges are excluded. */
  flowEdges: number;
  /**
   * Flow edges whose target icon sits behind the source along the diagram flow.
   * Request/response pairs are excluded: one direction must point backward.
   */
  backwardEdges: ID[];
  /** Flow edges that point forward but whose route doubles back against the flow. */
  backtrackingEdges: ID[];
  bends: number;
  crossings: number;
}

const AXIS_TOLERANCE = 8;
const BACKTRACK_TOLERANCE = 24;

/** Deterministic flow-direction measures for a routed automatic layout. */
export function readabilityMetrics(
  doc: DiagramDocument,
  layout: LayoutResult,
  invariantFailures: readonly InvariantFailure[],
): ReadabilityMetrics {
  const axis = doc.flow === "tb" ? "y" : "x";
  const size = axis === "x" ? "w" : "h";
  const nodes = new Map(layout.nodes.map((node) => [node.id, node.icon]));
  const routes = new Map(layout.edges.map((edge) => [edge.id, edge.points]));
  const metrics: ReadabilityMetrics = {
    flowEdges: 0,
    backwardEdges: [],
    backtrackingEdges: [],
    bends: 0,
    crossings: invariantFailures.filter((failure) => failure.code === "edge-crossing").length,
  };
  const pairs = new Set(doc.edges.filter(isFlow).map((edge) => `${edge.source}\0${edge.target}`));
  for (const edge of doc.edges) {
    const points = routes.get(edge.id);
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!points || !source || !target) continue;
    metrics.bends += Math.max(0, points.length - 2);
    if (!isFlow(edge)) continue;
    metrics.flowEdges++;
    const advance = target[axis] + target[size] / 2 - (source[axis] + source[size] / 2);
    if (advance < -AXIS_TOLERANCE) {
      if (!pairs.has(`${edge.target}\0${edge.source}`)) metrics.backwardEdges.push(edge.id);
      continue;
    }
    let retreat = 0;
    for (let index = 1; index < points.length; index++)
      retreat += Math.max(0, points[index - 1]![axis] - points[index]![axis]);
    if (retreat > BACKTRACK_TOLERANCE) metrics.backtrackingEdges.push(edge.id);
  }
  return metrics;
}
