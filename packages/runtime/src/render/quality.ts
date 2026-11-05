import type { ValidationIssue } from "../core/index.js";
import type { InvariantFailure } from "./invariants.js";

export type QualityTier = "hard" | "soft" | "warning";

export type QualityFinding = {
  tier: QualityTier;
  code: string;
  message: string;
  key: string;
};

/** Lexicographic tuple for deterministic candidate comparison. */
export type QualityTuple = {
  hard: number;
  soft: number;
  warnings: number;
  score: number;
};

const HARD_INVARIANT_CODES = new Set([
  "edge-route-missing",
  "edge-icon-collision",
  "edge-obstacle-collision",
  "edge-port-detached",
  "edge-label-collision",
]);

const SOFT_INVARIANT_CODES = new Set([
  "resource-icon-overlap",
  "edge-crossing",
  "edge-corridor-overlap",
  "edge-reverse-overlap",
  "edge-label-node-collision",
  "edge-label-group-collision",
  "edge-badge-label-collision",
  "edge-badge-node-collision",
  "edge-badge-group-collision",
  "edge-badge-connector-collision",
  "edge-label-overlap",
  "edge-badge-overlap",
  "az-asymmetry",
]);

const INVARIANT_WEIGHTS: Record<string, number> = {
  "edge-route-missing": 1_000_000,
  "resource-icon-overlap": 50_000,
  "edge-icon-collision": 1_000_000,
  "edge-obstacle-collision": 1_000_000,
  "edge-port-detached": 1_000_000,
  "edge-label-collision": 800_000,
  "edge-crossing": 300_000,
  "edge-corridor-overlap": 4_000,
  "edge-reverse-overlap": 4_000,
  "edge-label-node-collision": 10_000,
  "edge-label-group-collision": 10_000,
  "edge-badge-label-collision": 10_000,
  "edge-badge-node-collision": 10_000,
  "edge-badge-group-collision": 10_000,
  "edge-badge-connector-collision": 10_000,
  "edge-label-overlap": 10_000,
  "edge-badge-overlap": 10_000,
  "az-asymmetry": 50_000,
};

export function invariantTier(code: string): QualityTier {
  if (HARD_INVARIANT_CODES.has(code)) return "hard";
  if (SOFT_INVARIANT_CODES.has(code)) return "soft";
  return "hard";
}

export function qualityFindings(
  issues: ValidationIssue[],
  invariantFailures: InvariantFailure[],
  parseError?: string,
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  if (parseError) {
    findings.push({
      tier: "hard",
      code: "parse",
      message: parseError,
      key: `parse\0${parseError}`,
    });
  }
  for (const issue of issues) {
    const tier: QualityTier = issue.level === "error" ? "hard" : "warning";
    findings.push({
      tier,
      code: issue.code,
      message: issue.message,
      key: `issue\0${issue.level}\0${issue.code}\0${issue.message}`,
    });
  }
  for (const failure of invariantFailures) {
    const tier = invariantTier(failure.code);
    findings.push({
      tier,
      code: failure.code,
      message: failure.message,
      key: invariantFindingKey(failure),
    });
  }
  return findings;
}

export function invariantFindingKey(failure: InvariantFailure): string {
  return `invariant\0${failure.code}\0${[...failure.elementIds].sort().join("\0")}\0${failure.message}`;
}

export function assessQuality(findings: QualityFinding[]): QualityTuple & { clean: boolean } {
  let hard = 0;
  let soft = 0;
  let warnings = 0;
  let score = 0;
  for (const finding of findings) {
    if (finding.tier === "hard") {
      hard += 1;
      score += finding.code === "parse" ? 10_000_000 : 5_000_000;
    } else if (finding.tier === "soft") {
      soft += 1;
      score += INVARIANT_WEIGHTS[finding.code] ?? 1_000;
    } else {
      warnings += 1;
      score += finding.code === "routing" ? 500_000 : 1_000;
    }
  }
  return { hard, soft, warnings, score, clean: findings.length === 0 };
}

/** Negative when `a` is strictly better than `b`. */
export function compareQuality(a: QualityTuple, b: QualityTuple): number {
  if (a.hard !== b.hard) return a.hard - b.hard;
  if (a.soft !== b.soft) return a.soft - b.soft;
  if (a.warnings !== b.warnings) return a.warnings - b.warnings;
  return a.score - b.score;
}

export function isQualityImproved(current: QualityTuple, candidate: QualityTuple): boolean {
  return compareQuality(candidate, current) < 0;
}

/** Reject candidates that introduce findings absent from the baseline multiset. */
export function qualityRegressionReason(baseline: QualityFinding[], candidate: QualityFinding[]): string | undefined {
  return qualityRegressionReasonForTier(baseline, candidate, () => true);
}

/** Reject candidates that introduce new hard-tier findings absent from baseline. */
export function qualityHardRegressionReason(
  baseline: QualityFinding[],
  candidate: QualityFinding[],
): string | undefined {
  return qualityRegressionReasonForTier(baseline, candidate, (finding) => finding.tier === "hard");
}

function qualityRegressionReasonForTier(
  baseline: QualityFinding[],
  candidate: QualityFinding[],
  includeCandidate: (finding: QualityFinding) => boolean,
): string | undefined {
  const remaining = new Map<string, number>();
  for (const finding of baseline) {
    remaining.set(finding.key, (remaining.get(finding.key) ?? 0) + 1);
  }
  for (const finding of candidate) {
    if (!includeCandidate(finding)) continue;
    const count = remaining.get(finding.key) ?? 0;
    if (count > 0) {
      remaining.set(finding.key, count - 1);
      continue;
    }
    return finding.message;
  }
  return undefined;
}

export function topQualityFinding(findings: QualityFinding[]): QualityFinding | undefined {
  const ranked = [...findings].sort((a, b) => {
    const tierRank = (tier: QualityTier) => (tier === "hard" ? 0 : tier === "soft" ? 1 : 2);
    const tierDelta = tierRank(a.tier) - tierRank(b.tier);
    if (tierDelta !== 0) return tierDelta;
    const weightDelta = (INVARIANT_WEIGHTS[b.code] ?? 0) - (INVARIANT_WEIGHTS[a.code] ?? 0);
    if (weightDelta !== 0) return weightDelta;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return ranked[0];
}
