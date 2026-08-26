import type { CatalogRule } from "../core/index.js";
import manifest from "./generated/runtime-manifest.js";

export type UserCloudProvider = "aws" | "azure" | "gcp" | "cloud-agnostic";
/** Legacy provider names remain accepted for document compatibility only. */
export type CloudProvider = UserCloudProvider | "neutral" | "generic";
export type CatalogProviderFilter = CloudProvider | "all";
export type AssetKind = "resource" | "group" | "service" | "category";
export type IconSpecificity = "unique" | "shared-category" | "semantic-neutral";
export type ColumnRole =
  | "edge"
  | "ingress"
  | "compute"
  | "queue"
  | "worker"
  | "data"
  | "observability"
  | "auth";

export interface CatalogIcon {
  sourceId: string;
  sourcePath: string;
  browserPath: string;
  sha256: string;
  specificity: IconSpecificity;
}

export interface CatalogEntry extends CatalogRule {
  type: string;
  provider: UserCloudProvider;
  assetKind: "resource" | "group";
  name: string;
  serviceName: string;
  categories: string[];
  category: string;
  aliases: string[];
  icon: CatalogIcon;
  /** Source path retained for `.dgm` and CLI compatibility. */
  iconPath: string;
  browserPath: string;
  specificity: IconSpecificity;
  column: ColumnRole;
  sizeTier: "primary" | "secondary";
  groupKind?: string;
  canonical: boolean;
  browsable: boolean;
}

type ManifestEntry = Omit<CatalogEntry, "provider"> & {
  provider: UserCloudProvider;
};

const LEGACY_TYPE_ALIASES: Record<string, string> = {
  ...(manifest.aliases as Record<string, string>),
  "aws.alb": "aws.elastic-load-balancing",
  "aws.ecs": "aws.elastic-container-service",
  "aws.lambda": "aws.aws-lambda",
  "aws.sqs": "aws.simple-queue-service",
  "aws.sns": "aws.simple-notification-service",
  "aws.s3": "aws.simple-storage-service",
  "aws.apigateway": "aws.api-gateway",
  "aws.route53": "aws.route-53",
  "aws.stepfunctions": "aws.aws-step-functions",
  "aws.appsync": "aws.aws-appsync",
  "aws.cloudformation": "aws.aws-cloudformation",
};

const RULE_OVERRIDES: Partial<Record<string, Partial<CatalogEntry>>> = {
  "aws.elastic-load-balancing": {
    allowedParents: ["subnet-public", "subnet-private", "subnet", "az", "vpc", "logical", "region"],
  },
  "aws.elastic-container-service": {
    allowedParents: ["subnet-public", "subnet-private", "subnet", "az", "logical"],
  },
  "aws.ec2": {
    allowedParents: ["subnet-public", "subnet-private", "subnet", "az", "logical"],
  },
  "aws.internet-gateway": {
    allowedParents: ["vpc", "region"],
  },
};

function normalizeProvider(provider: CloudProvider): UserCloudProvider {
  return provider === "generic" || provider === "neutral" ? "cloud-agnostic" : provider;
}

function buildCatalog(): Record<string, CatalogEntry> {
  const out: Record<string, CatalogEntry> = {};
  for (const raw of (manifest as { entries: ManifestEntry[] }).entries) {
    const override = RULE_OVERRIDES[raw.type] ?? {};
    out[raw.type] = {
      ...raw,
      ...override,
      provider: normalizeProvider(raw.provider),
      assetKind: raw.assetKind,
      name: raw.name ?? raw.serviceName,
      serviceName: raw.serviceName ?? raw.name,
      categories: raw.categories ?? [raw.category],
      aliases: raw.aliases ?? [],
      browserPath: raw.browserPath ?? raw.icon?.browserPath ?? raw.iconPath,
      canonical: true,
      browsable: raw.browsable !== false,
    };
  }

  for (const [alias, target] of Object.entries(LEGACY_TYPE_ALIASES)) {
    const entry = out[target];
    if (!entry || out[alias]) continue;
    out[alias] = {
      ...entry,
      type: alias,
      aliases: [...entry.aliases, alias],
      canonical: false,
      browsable: false,
    };
  }
  return out;
}

export const CATALOG: Record<string, CatalogEntry> = buildCatalog();

// Catalog rules are immutable after startup. Reusing the index avoids
// rebuilding a 1.5k-entry Map on every validation/compile pass (which is
// especially costly while editing source or committing gesture previews).
const CATALOG_MAP = new Map<string, CatalogRule>(
  Object.values(CATALOG).map((entry) => [entry.type, entry]),
);

export function getCatalogMap(): Map<string, CatalogRule> {
  return CATALOG_MAP;
}

export function getCatalogEntry(type: string): CatalogEntry | undefined {
  return CATALOG[type];
}

export function getCatalogEntryByBrowserPath(browserPath: string): CatalogEntry | undefined {
  return Object.values(CATALOG).find(
    (entry) => entry.canonical && entry.icon.browserPath === browserPath,
  );
}

export function listProviders(): UserCloudProvider[] {
  return ["aws", "azure", "gcp", "cloud-agnostic"];
}

export function listCategories(
  provider: CatalogProviderFilter,
  mode: "resources" | "groups" = "resources",
): string[] {
  const assetKind = mode === "groups" ? "group" : "resource";
  const cats = new Set<string>();
  for (const entry of Object.values(CATALOG)) {
    if (!entry.canonical || !entry.browsable) continue;
    if (
      (provider !== "all" && entry.provider !== normalizeProvider(provider)) ||
      entry.assetKind !== assetKind
    ) continue;
    for (const category of entry.categories) cats.add(category);
  }
  return [...cats].sort((a, b) => a.localeCompare(b));
}

export function listAssets(
  provider: CatalogProviderFilter,
  options: { category?: string; assetKind?: AssetKind; includeAliases?: boolean } = {},
): CatalogEntry[] {
  const normalized = provider === "all" ? undefined : normalizeProvider(provider);
  const kind = options.assetKind === "service" ? "resource" : options.assetKind === "category" ? "resource" : options.assetKind;
  return Object.values(CATALOG).filter((entry) => {
    if (!options.includeAliases && (!entry.canonical || !entry.browsable)) return false;
    if (normalized && entry.provider !== normalized) return false;
    if (kind && entry.assetKind !== kind) return false;
    if (options.category && !entry.categories.includes(options.category)) return false;
    return true;
  });
}

export function searchAssets(query: string, provider?: CatalogProviderFilter): CatalogEntry[] {
  const needle = query.trim().toLowerCase();
  const normalized = provider && provider !== "all" ? normalizeProvider(provider) : undefined;
  return Object.values(CATALOG).filter((entry) => {
    if (!entry.canonical || !entry.browsable) return false;
    if (normalized && entry.provider !== normalized) return false;
    if (!needle) return entry.assetKind === "resource";
    const hay = [
      entry.name,
      entry.serviceName,
      entry.type,
      entry.category,
      ...entry.categories,
      ...entry.aliases,
    ].join(" ").toLowerCase();
    return hay.includes(needle);
  });
}

export function listBrowsableAssets(
  provider: CatalogProviderFilter,
  mode: "resources" | "groups",
): CatalogEntry[] {
  return listAssets(provider, { assetKind: mode === "groups" ? "group" : "resource" }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
