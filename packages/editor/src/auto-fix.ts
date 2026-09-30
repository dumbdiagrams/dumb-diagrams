import type { DiagramDocument, ID } from "@dumb-diagrams/runtime/core";
import {
  assessQuality,
  compareQuality,
  isQualityImproved,
  qualityFindings,
  qualityHardRegressionReason,
  topQualityFinding,
  type QualityFinding,
  type QualityTuple,
} from "@dumb-diagrams/runtime/render";

import {
  compileDocument,
  type DiagramCompilation,
} from "./diagram-compiler";
import {
  clearAllRoutes,
  clearPlaces,
  clearRoute,
  clearView,
} from "./editor-model";

export type AutoFixStrategy =
  | "unchanged"
  | "clear-routes-targeted"
  | "clear-routes-all"
  | "clear-places-targeted"
  | "clear-view";

export type AutoFixPlan = {
  status: "unchanged" | "repaired" | "unresolved" | "blocked";
  doc: DiagramDocument;
  strategy: AutoFixStrategy;
  message?: string;
  compilation?: DiagramCompilation;
};

type Candidate = {
  strategy: AutoFixStrategy;
  doc: DiagramDocument;
  compilation: DiagramCompilation;
  findings: QualityFinding[];
  quality: QualityTuple;
};

const STRATEGY_RANK: Record<AutoFixStrategy, number> = {
  unchanged: 0,
  "clear-routes-targeted": 1,
  "clear-routes-all": 2,
  "clear-places-targeted": 3,
  "clear-view": 4,
};

export function planAutoFix(
  doc: DiagramDocument,
  snapToGrid: boolean,
  precompiled?: DiagramCompilation,
): AutoFixPlan {
  const currentCompilation =
    precompiled?.ok && precompiled.doc === doc
      ? precompiled
      : compileDocument(doc, snapToGrid);
  if (!currentCompilation.ok) {
    const message =
      ("parseError" in currentCompilation && currentCompilation.parseError) ||
      currentCompilation.issues.find((issue) => issue.level === "error")?.message ||
      currentCompilation.issues[0]?.message ||
      "Diagram cannot be compiled";
    return {
      status: "blocked",
      doc,
      strategy: "unchanged",
      message,
    };
  }

  const currentFindings = compilationFindings(currentCompilation);
  const currentQuality = assessQuality(currentFindings);
  if (currentQuality.clean) {
    return {
      status: "unchanged",
      doc,
      strategy: "unchanged",
      message: "Diagram already passes Auto-fix checks",
    };
  }

  const edgeIds = new Set(doc.edges.map((edge) => edge.id));
  const entityIds = new Set<ID>([
    ...doc.resources.map((resource) => resource.id),
    ...doc.groups.map((group) => group.id),
  ]);
  const implicatedEdges = implicatedEdgeIds(currentFindings, edgeIds);
  const implicatedPlaces = implicatedEntityIds(
    currentFindings,
    entityIds,
    edgeIds,
    doc,
  );

  const candidates: Candidate[] = [];
  const addCandidate = (strategy: AutoFixStrategy, candidateDoc: DiagramDocument) => {
    const compilation = compileDocument(candidateDoc, snapToGrid);
    const findings = compilationFindings(compilation);
    candidates.push({
      strategy,
      doc: candidateDoc,
      compilation,
      findings,
      quality: assessQuality(findings),
    });
  };

  if (implicatedEdges.length) {
    let routed = doc;
    for (const edgeId of implicatedEdges) routed = clearRoute(routed, edgeId);
    addCandidate("clear-routes-targeted", routed);
  }

  addCandidate("clear-routes-all", clearAllRoutes(doc));

  if (implicatedPlaces.length) {
    addCandidate("clear-places-targeted", clearPlaces(doc, implicatedPlaces));
  }

  addCandidate("clear-view", clearView(doc));

  const viable = candidates.filter((candidate) => {
    if (!candidate.compilation.ok) return false;
    if (qualityHardRegressionReason(currentFindings, candidate.findings)) return false;
    return isQualityImproved(currentQuality, candidate.quality);
  });

  if (!viable.length) {
    const top = topQualityFinding(currentFindings);
    return {
      status: "unresolved",
      doc,
      strategy: "unchanged",
      message: top?.message ?? "Auto-fix could not improve the diagram",
    };
  }

  viable.sort((a, b) => {
    const qualityDelta = compareQuality(a.quality, b.quality);
    if (qualityDelta !== 0) return qualityDelta;
    return STRATEGY_RANK[a.strategy] - STRATEGY_RANK[b.strategy];
  });

  const best = viable[0]!;
  return {
    status: "repaired",
    doc: best.doc,
    strategy: best.strategy,
    message: strategyToast(best.strategy),
    compilation: best.compilation,
  };
}

function compilationFindings(compilation: DiagramCompilation): QualityFinding[] {
  const parseError =
    !compilation.ok && "parseError" in compilation
      ? compilation.parseError
      : undefined;
  return qualityFindings(
    compilation.issues,
    compilation.invariantFailures,
    parseError,
  );
}

function implicatedEdgeIds(
  findings: QualityFinding[],
  edgeIds: ReadonlySet<string>,
): ID[] {
  const ids: ID[] = [];
  for (const finding of findings) {
    for (const id of elementIdsFromFindingKey(finding.key)) {
      if (edgeIds.has(id)) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

function implicatedEntityIds(
  findings: QualityFinding[],
  entityIds: ReadonlySet<ID>,
  edgeIds: ReadonlySet<string>,
  doc: DiagramDocument,
): ID[] {
  const ids: ID[] = [];
  for (const finding of findings) {
    for (const id of elementIdsFromFindingKey(finding.key)) {
      if (entityIds.has(id)) {
        ids.push(id);
        continue;
      }
      if (edgeIds.has(id)) {
        const edge = doc.edges.find((candidate) => candidate.id === id);
        if (edge) ids.push(edge.source, edge.target);
      }
    }
  }
  return [...new Set(ids)];
}

function elementIdsFromFindingKey(key: string): ID[] {
  const parts = key.split("\0");
  if (parts[0] === "invariant" && parts.length >= 3) {
    return parts.slice(2, -1);
  }
  if (parts[0] === "issue" && parts.length >= 4) {
    return [];
  }
  return [];
}

function strategyToast(strategy: AutoFixStrategy): string {
  switch (strategy) {
    case "clear-routes-targeted":
      return "Diagram auto-fixed (re-routed affected connectors)";
    case "clear-routes-all":
      return "Diagram auto-fixed (re-routed connectors)";
    case "clear-places-targeted":
      return "Diagram auto-fixed (adjusted placement)";
    case "clear-view":
      return "Diagram auto-fixed";
    default:
      return "Diagram auto-fixed";
  }
}
