import type { Grammar } from "../core/index.js";

export interface GroupColorDefaults {
  stroke: string;
  fill: string;
}

const AZURE_GROUP_COLORS: Record<string, GroupColorDefaults> = {
  "azure.subscription": palette("#FF9300"),
  "azure.region": palette("#EF7100", 0.05),
  "azure.vnet": palette("#50E6FF", 0.05),
  "azure.az": palette("#50E6FF", 0.04),
  "azure.subnet": palette("#1490DF", 0.03),
  "azure.resource-group": palette("#949494", 0.03),
};

const GCP_GROUP_COLORS: Record<string, GroupColorDefaults> = {
  "gcp.organization": palette("#4285F4", 0.03),
  "gcp.project": palette("#4285F4", 0.04),
  "gcp.vpc": palette("#4285F4", 0.05),
  "gcp.region": palette("#9AA0A6", 0.05),
  "gcp.zone": palette("#2B80F8", 0.04),
  "gcp.subnet": palette("#9AA0A6", 0.03),
};

const PROVIDER_GROUP_COLORS: Partial<Record<Grammar, Record<string, GroupColorDefaults>>> = {
  azure: AZURE_GROUP_COLORS,
  gcp: GCP_GROUP_COLORS,
};

export function resolveProviderGroupColors(
  grammar: Grammar,
  type: string | undefined,
): GroupColorDefaults | null {
  if (!type) return null;
  return PROVIDER_GROUP_COLORS[grammar]?.[type] ?? null;
}

function palette(stroke: string, alpha = 0.04): GroupColorDefaults {
  return { stroke, fill: fillFromStroke(stroke, alpha) };
}

function fillFromStroke(stroke: string, alpha: number): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(stroke);
  if (!match) return stroke;
  return `rgba(${Number.parseInt(match[1]!, 16)},${Number.parseInt(match[2]!, 16)},${Number.parseInt(match[3]!, 16)},${alpha})`;
}
