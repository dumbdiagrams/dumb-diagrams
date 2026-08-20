#!/usr/bin/env node

/**
 * Build the deterministic, canonical catalog.
 *
 * The generator only reads checked-in source trees. Upstream archives are
 * acquired and validated by `scripts/icon-workflow.mjs`; this keeps generation
 * machine-path-free and makes the browser manifest reproducible.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const OUT = join(ROOT, "packages/catalog/src/generated/manifest.json");
const LOCK_PATH = join(ROOT, "icon-sources.lock.json");
const COLLISION_PATH = join(ROOT, "catalog-collisions.json");

const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
const collisionPolicy = JSON.parse(readFileSync(COLLISION_PATH, "utf8"));

const ALL_PARENT_KINDS = [
  "logical",
  "region",
  "account",
  "cloud",
  "subnet-public",
  "subnet-private",
  "subnet",
  "az",
  "vpc",
];

const CATEGORY_COLUMN = {
  Databases: "data",
  Compute: "compute",
  Containers: "compute",
  Storage: "data",
  Networking: "ingress",
  Security: "auth",
  Analytics: "data",
  "Data Analytics": "data",
  Integration: "queue",
  "Integration Services": "queue",
  "Application Integration": "queue",
  "Management Tools": "observability",
  "Developer Tools": "compute",
  "AI & Machine Learning": "compute",
  "Artificial Intelligence": "compute",
  "Machine Learning": "compute",
  "Internet of Things": "compute",
  "Migration Modernization": "compute",
  "Cloud Financial Management": "observability",
  "End User Computing": "compute",
  "Front End Web Mobile": "ingress",
  "Media Services": "data",
  "Blockchain": "data",
  "Games": "compute",
  Satellite: "compute",
  "Quantum Technologies": "compute",
  "Customer Enablement": "observability",
  "General Icons": "edge",
  Actors: "edge",
  Clients: "edge",
  Compute: "compute",
  Data: "data",
  Network: "ingress",
  Security: "auth",
  Observability: "observability",
};

const GCP_PRODUCT_CATEGORIES = {
  "AI Hypercomputer": "Compute",
  AlloyDB: "Databases",
  Anthos: "Hybrid & Multicloud",
  Apigee: "Integration Services",
  BigQuery: "Data Analytics",
  "Cloud Run": "Serverless Computing",
  "Cloud SQL": "Databases",
  "Cloud Spanner": "Databases",
  "Cloud Storage": "Storage",
  "Compute Engine": "Compute",
  "Distributed Cloud": "Hybrid & Multicloud",
  GKE: "Containers",
  Hyperdisk: "Storage",
  Looker: "Business Intelligence",
  Mandiant: "Security Identity",
  "Security Command Center": "Security Identity",
  "Security Operations": "Operations",
  "Threat Intelligence": "Security Identity",
  "Vertex AI": "AI & Machine Learning",
};

const GCP_CATEGORY_ASSETS = [
  "AI _ Machine Learning",
  "Agents",
  "Business Intelligence",
  "Collaboration",
  "Compute",
  "Containers",
  "Data Analytics",
  "Databases",
  "DevOps",
  "Developer Tools",
  "Hybrid & Multicloud",
  "Integration Services",
  "Management Tools",
  "Maps & Geospatial",
  "Marketplace",
  "Media Services",
  "Migration",
  "Mixed Reality",
  "Networking",
  "Observability",
  "Operations",
  "Security Identity",
  "Serverless Computing",
  "Storage",
  "Web & Mobile",
  "Web3",
];

const PROVIDER_GROUPS = [
  {
    type: "aws.cloud",
    provider: "aws",
    name: "AWS Cloud",
    iconPath: "aws-icons/Architecture-Group-Icons_07312026/AWS-Cloud_32.svg",
    kind: "cloud",
  },
  {
    type: "aws.account",
    provider: "aws",
    name: "AWS Account",
    iconPath: "aws-icons/Architecture-Group-Icons_07312026/AWS-Account_32.svg",
    kind: "account",
  },
  {
    type: "aws.region",
    provider: "aws",
    name: "Region",
    iconPath: "aws-icons/Architecture-Group-Icons_07312026/Region_32.svg",
    kind: "region",
  },
  {
    type: "aws.vpc",
    provider: "aws",
    name: "VPC",
    iconPath:
      "aws-icons/Architecture-Group-Icons_07312026/Virtual-private-cloud-VPC_32.svg",
    kind: "vpc",
  },
  {
    type: "aws.az",
    provider: "aws",
    name: "Availability Zone",
    iconPath: "aws-icons/Architecture-Group-Icons_07312026/Region_32.svg",
    kind: "az",
  },
  {
    type: "aws.subnet.public",
    provider: "aws",
    name: "Public Subnet",
    iconPath:
      "aws-icons/Architecture-Group-Icons_07312026/Public-subnet_32.svg",
    kind: "subnet-public",
  },
  {
    type: "aws.subnet.private",
    provider: "aws",
    name: "Private Subnet",
    iconPath:
      "aws-icons/Architecture-Group-Icons_07312026/Private-subnet_32.svg",
    kind: "subnet-private",
  },
  {
    type: "azure.subscription",
    provider: "azure",
    name: "Subscription",
    iconPath: "azure-icons/Icons/general/10002-icon-service-Subscriptions.svg",
    kind: "account",
  },
  {
    type: "azure.region",
    provider: "azure",
    name: "Region",
    iconPath:
      "azure-icons/Icons/general/10116-icon-service-Region-Management.svg",
    kind: "region",
  },
  {
    type: "azure.vnet",
    provider: "azure",
    name: "Virtual Network",
    iconPath:
      "azure-icons/Icons/networking/10061-icon-service-Virtual-Networks.svg",
    kind: "vpc",
  },
  {
    type: "azure.az",
    provider: "azure",
    name: "Availability Zone",
    iconPath:
      "azure-icons/Icons/compute/10021-icon-service-Virtual-Machine.svg",
    kind: "az",
  },
  {
    type: "azure.subnet",
    provider: "azure",
    name: "Subnet",
    iconPath: "azure-icons/Icons/networking/02742-icon-service-Subnet.svg",
    kind: "subnet",
  },
  {
    type: "azure.resource-group",
    provider: "azure",
    name: "Resource Group",
    iconPath:
      "azure-icons/Icons/general/10007-icon-service-Resource-Groups.svg",
    kind: "logical",
  },
  {
    type: "gcp.organization",
    provider: "gcp",
    name: "Organization",
    iconPath:
      "gcp-icons/Category Icons/Management Tools/SVG/ManagementTools-512-color.svg",
    kind: "cloud",
  },
  {
    type: "gcp.project",
    provider: "gcp",
    name: "Project",
    iconPath:
      "gcp-icons/Category Icons/Management Tools/SVG/ManagementTools-512-color.svg",
    kind: "account",
  },
  {
    type: "gcp.region",
    provider: "gcp",
    name: "Region",
    iconPath:
      "gcp-icons/Category Icons/Networking/SVG/Networking-512-color-rgb.svg",
    kind: "region",
  },
  {
    type: "gcp.zone",
    provider: "gcp",
    name: "Zone",
    iconPath: "gcp-icons/Category Icons/Compute/SVG/Compute-512-color.svg",
    kind: "az",
  },
  {
    type: "gcp.vpc",
    provider: "gcp",
    name: "VPC Network",
    iconPath:
      "gcp-icons/Category Icons/Networking/SVG/Networking-512-color-rgb.svg",
    kind: "vpc",
  },
  {
    type: "gcp.subnet",
    provider: "gcp",
    name: "Subnet",
    iconPath:
      "gcp-icons/Category Icons/Networking/SVG/Networking-512-color-rgb.svg",
    kind: "subnet",
  },
];

const CLOUD_GROUPS = [
  ["cloud-agnostic.cloud", "Cloud", "cloud-icons/cloud.svg", "cloud"],
  ["cloud-agnostic.account", "Account", "cloud-icons/tenant.svg", "account"],
  ["cloud-agnostic.region", "Region", "cloud-icons/region.svg", "region"],
  ["cloud-agnostic.zone", "Zone", "cloud-icons/zone.svg", "az"],
  ["cloud-agnostic.network", "Network", "cloud-icons/network.svg", "vpc"],
  ["cloud-agnostic.subnet", "Subnet", "cloud-icons/subnet.svg", "subnet"],
  [
    "cloud-agnostic.security-group",
    "Security Group",
    "cloud-icons/security-group.svg",
    "logical",
  ],
  ["cloud-agnostic.cluster", "Cluster", "cloud-icons/cluster.svg", "logical"],
  [
    "cloud-agnostic.datacenter",
    "Data Center",
    "cloud-icons/datacenter.svg",
    "logical",
  ],
  ["cloud-agnostic.logical", "Logical Group", "cloud-icons/logical.svg", "logical"],
  [
    "cloud-agnostic.trust-boundary",
    "Trust Boundary",
    "cloud-icons/trust-boundary.svg",
    "overlay",
  ],
];

const CLOUD_RESOURCES = [
  ["cloud-agnostic.actor", "Actor", "Actors", "neutral-icons/actor.svg", ["user", "users"]],
  ["cloud-agnostic.client", "Client", "Clients", "neutral-icons/client.svg", ["browser", "mobile client"]],
  ["cloud-agnostic.server", "Server", "Compute", "neutral-icons/server.svg", ["host"]],
  ["cloud-agnostic.function", "Function", "Compute", "neutral-icons/function.svg", ["lambda", "serverless"]],
  ["cloud-agnostic.container", "Container", "Compute", "neutral-icons/container.svg", ["service"]],
  ["cloud-agnostic.cluster-node", "Cluster Node", "Compute", "neutral-icons/cluster-node.svg", ["node"]],
  ["cloud-agnostic.gateway", "Gateway", "Network", "neutral-icons/gateway.svg", ["api gateway"]],
  ["cloud-agnostic.load-balancer", "Load Balancer", "Network", "neutral-icons/load-balancer.svg", ["proxy"]],
  ["cloud-agnostic.firewall", "Firewall", "Security", "neutral-icons/firewall.svg", ["waf"]],
  ["cloud-agnostic.vpn", "VPN", "Network", "neutral-icons/vpn.svg", ["tunnel"]],
  ["cloud-agnostic.dns", "DNS", "Network", "neutral-icons/dns.svg", ["domain"]],
  ["cloud-agnostic.database", "Database", "Data", "neutral-icons/database.svg", ["sql", "store"]],
  ["cloud-agnostic.cache", "Cache", "Data", "neutral-icons/cache.svg", ["redis"]],
  ["cloud-agnostic.object-storage", "Object Storage", "Data", "neutral-icons/object-storage.svg", ["bucket", "blob"]],
  ["cloud-agnostic.queue", "Queue", "Data", "neutral-icons/queue.svg", ["message queue"]],
  ["cloud-agnostic.event", "Event", "Data", "neutral-icons/event.svg", ["message", "notification"]],
  ["cloud-agnostic.stream", "Stream", "Data", "neutral-icons/stream.svg", ["data stream"]],
  ["cloud-agnostic.identity", "Identity", "Security", "neutral-icons/identity.svg", ["iam", "principal"]],
  ["cloud-agnostic.key", "Key", "Security", "neutral-icons/key.svg", ["encryption"]],
  ["cloud-agnostic.certificate", "Certificate", "Security", "neutral-icons/certificate.svg", ["tls", "ssl"]],
  ["cloud-agnostic.observability", "Observability", "Observability", "neutral-icons/observability.svg", ["monitoring", "telemetry"]],
  ["cloud-agnostic.repository", "Repository", "Delivery", "neutral-icons/repository.svg", ["source code", "git"]],
  ["cloud-agnostic.pipeline", "CI/CD Pipeline", "Delivery", "neutral-icons/pipeline.svg", ["build", "deploy"]],
  ["cloud-agnostic.device", "Device", "Actors", "neutral-icons/device.svg", ["edge"]],
  ["cloud-agnostic.cloud", "Cloud", "Network", "neutral-icons/cloud-resource.svg", ["provider"]],
];

function slug(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function pathHash(file) {
  return createHash("sha256").update(sourcePath(file)).digest("hex");
}

function validateSvg(file) {
  const content = readFileSync(file, "utf8");
  if (Buffer.byteLength(content) === 0 || !/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(content)) {
    throw new Error(`Malformed SVG root: ${relative(ROOT, file)}`);
  }
  if (/<(?:script|foreignObject)\b|\bon[a-z]+\s*=|javascript:/i.test(content)) {
    throw new Error(`Unsafe SVG content: ${relative(ROOT, file)}`);
  }
  if (!/\bviewBox\s*=|\bwidth\s*=/.test(content)) {
    throw new Error(`SVG has no viewBox or width: ${relative(ROOT, file)}`);
  }
  return content;
}

function sourcePath(file) {
  return relative(ROOT, file).replaceAll("\\", "/");
}

function iconAsset(provider, kind, name, file, specificity) {
  validateSvg(file);
  const source = sourcePath(file);
  const hash = sha256(file);
  const sourceId = `${provider}-${kind}-${slug(name)}-${hash.slice(0, 8)}-${pathHash(file).slice(0, 8)}`;
  return {
    sourceId,
    sourcePath: source,
    browserPath: `catalog-icons/${provider}/${sourceId}.svg`,
    sha256: hash,
    specificity,
  };
}

function uniqueType(baseType, file, used, collisionLog) {
  if (!used.has(baseType)) {
    used.add(baseType);
    return baseType;
  }
  if (!collisionPolicy.allowHashSuffix) {
    throw new Error(`Unreviewed catalog collision for ${baseType}`);
  }
  const suffix = pathHash(file).slice(0, 10);
  const resolved = `${baseType}-${suffix}`;
  if (used.has(resolved)) throw new Error(`Unresolvable catalog collision for ${baseType}`);
  used.add(resolved);
  collisionLog.push({ baseType, resolvedType: resolved, sourcePath: sourcePath(file) });
  return resolved;
}

function entry({
  type,
  provider,
  assetKind,
  name,
  category,
  categories,
  aliases = [],
  file,
  specificity,
  groupKind,
  allowedParents = ALL_PARENT_KINDS,
  allowRoot = false,
  scope = "regional",
}) {
  const icon = iconAsset(provider, assetKind, name, file, specificity);
  return {
    type,
    provider,
    assetKind,
    name,
    serviceName: name,
    categories: categories ?? [category],
    category: category ?? categories?.[0] ?? "General",
    aliases: [...new Set(aliases.filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    icon,
    iconPath: icon.sourcePath,
    browserPath: icon.browserPath,
    specificity,
    groupKind,
    allowedParents,
    allowRoot,
    scope,
    column: CATEGORY_COLUMN[category ?? categories?.[0] ?? ""] ?? "edge",
    sizeTier: "primary",
    canonical: true,
    browsable: true,
  };
}

function scanAws(used, collisionLog) {
  const base = join(ROOT, "aws-icons/Architecture-Service-Icons_07312026");
  const files = walk(base).filter((file) => file.endsWith("_64.svg"));
  return files.map((file) => {
    const rel = relative(base, file).replaceAll("\\", "/").split("/");
    const category = (rel[0] ?? "General").replace(/^Arch_/, "").replace(/-/g, " ");
    const display = basename(file, ".svg")
      .replace(/^Arch_/, "")
      .replace(/_\d+$/, "")
      .replace(/-/g, " ");
    const baseType = `aws.${slug(display.replace(/^Amazon /, "").replace(/^AWS /, "aws-"))}`;
    return entry({
      type: uniqueType(baseType, file, used, collisionLog),
      provider: "aws",
      assetKind: "resource",
      name: display,
      category,
      aliases: [display, baseType],
      file,
      specificity: "unique",
      allowedParents: ALL_PARENT_KINDS,
      allowRoot: false,
    });
  });
}

function scanAzure(used, collisionLog) {
  const base = join(ROOT, "azure-icons/Icons");
  const files = walk(base).filter((file) => file.endsWith(".svg"));
  return files.map((file) => {
    const rel = relative(base, file).replaceAll("\\", "/").split("/");
    const category = (rel[0] ?? "General").replace(/\+/g, " ");
    const display = basename(file, ".svg")
      // Azure has one legacy export with a space before `-icon-service-`.
      // Accept both spellings so source-file bookkeeping never leaks into UI labels.
      .replace(/^\d+\s*-?\s*icon-service-/i, "")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const baseType = `azure.${slug(display)}`;
    return entry({
      type: uniqueType(baseType, file, used, collisionLog),
      provider: "azure",
      assetKind: "resource",
      name: display,
      category,
      aliases: [display, baseType],
      file,
      specificity: "unique",
      allowedParents: ALL_PARENT_KINDS,
      allowRoot: false,
    });
  });
}

function scanGcp(used, collisionLog) {
  const base = join(ROOT, "gcp-icons/Unique Icons");
  const files = walk(base).filter((file) => file.endsWith(".svg"));
  return files.map((file) => {
    const rel = relative(base, file).replaceAll("\\", "/").split("/");
    const display = rel[0] ?? basename(file, ".svg");
    const category = GCP_PRODUCT_CATEGORIES[display] ?? "Other";
    const baseType = `gcp.${slug(display)}`;
    return entry({
      type: uniqueType(baseType, file, used, collisionLog),
      provider: "gcp",
      assetKind: "resource",
      name: display,
      category,
      aliases: [display, baseType],
      file,
      specificity: "unique",
      allowedParents: ALL_PARENT_KINDS,
      allowRoot: false,
    });
  });
}

function gcpCategoryAssets() {
  const base = join(ROOT, "gcp-icons/Category Icons");
  return GCP_CATEGORY_ASSETS.map((category) => {
    const files = walk(join(base, category)).filter((file) => file.endsWith(".svg"));
    const file = files[0];
    if (!file) throw new Error(`Missing GCP category glyph: ${category}`);
    const icon = iconAsset("gcp", "category", category, file, "shared-category");
    return { ...icon, name: category, browsable: false };
  });
}

function providerGroupEntries(used, collisionLog) {
  return PROVIDER_GROUPS.map((item) => {
    const file = join(ROOT, item.iconPath);
    if (!existsSync(file)) throw new Error(`Missing curated group icon: ${item.iconPath}`);
    return entry({
      type: item.type,
      provider: item.provider,
      assetKind: "group",
      name: item.name,
      category: "Groups",
      aliases: [item.name, item.type],
      file,
      specificity: item.provider === "gcp" ? "shared-category" : "unique",
      groupKind: item.kind,
      allowedParents: item.kind === "cloud" ? [] : ["cloud", "account", "region", "logical", "vpc", "az"],
      allowRoot: ["cloud", "account", "region"].includes(item.kind),
      scope: "global",
    });
  });
}

function cloudAgnosticEntries(used, collisionLog) {
  const groups = CLOUD_GROUPS.map(([type, name, relativeIcon, kind]) => {
    const file = join(ROOT, relativeIcon.replace("cloud-icons/", "neutral-icons/"));
    return entry({
      type,
      provider: "cloud-agnostic",
      assetKind: "group",
      name,
      category: "Groups",
      aliases: [name, type.replace("cloud-agnostic.", "neutral.")],
      file,
      specificity: "semantic-neutral",
      groupKind: kind,
      allowedParents: kind === "cloud" ? [] : ["cloud", "account", "region", "logical", "vpc", "az"],
      allowRoot: ["cloud", "account", "region"].includes(kind),
      scope: "global",
    });
  });
  const resources = CLOUD_RESOURCES.map(([type, name, category, iconPath, aliases]) => {
    const file = join(ROOT, iconPath);
    return entry({
      type,
      provider: "cloud-agnostic",
      assetKind: "resource",
      name,
      category,
      aliases: [name, type, ...aliases],
      file,
      specificity: "semantic-neutral",
      allowedParents: ALL_PARENT_KINDS,
      allowRoot: true,
      scope: "any",
    });
  });
  return [...groups, ...resources];
}

const usedTypes = new Set();
const collisionLog = [];
const entries = [
  ...providerGroupEntries(usedTypes, collisionLog),
  ...cloudAgnosticEntries(usedTypes, collisionLog),
  ...scanAws(usedTypes, collisionLog),
  ...scanAzure(usedTypes, collisionLog),
  ...scanGcp(usedTypes, collisionLog),
];

const legacyAliases = {
  "generic.user": "cloud-agnostic.actor",
  "generic.users": "cloud-agnostic.actor",
  "generic.client": "cloud-agnostic.client",
  "generic.mobile-client": "cloud-agnostic.client",
  "generic.server": "cloud-agnostic.server",
  "generic.database": "cloud-agnostic.database",
  "generic.firewall": "cloud-agnostic.firewall",
  "generic.custom": "cloud-agnostic.server",
  "neutral.cloud": "cloud-agnostic.cloud",
  "neutral.tenant": "cloud-agnostic.account",
  "neutral.region": "cloud-agnostic.region",
  "neutral.zone": "cloud-agnostic.zone",
  "neutral.network": "cloud-agnostic.network",
  "neutral.subnet": "cloud-agnostic.subnet",
  "neutral.security-group": "cloud-agnostic.security-group",
  "neutral.cluster": "cloud-agnostic.cluster",
  "neutral.datacenter": "cloud-agnostic.datacenter",
  "neutral.logical": "cloud-agnostic.logical",
  "neutral.trust-boundary": "cloud-agnostic.trust-boundary",
};

const iconFiles = new Map();
for (const item of entries.map((candidate) => candidate.icon)) {
  iconFiles.set(item.sourceId, item);
}
for (const item of gcpCategoryAssets()) iconFiles.set(item.sourceId, item);

const assetFiles = [...iconFiles.values()]
  .sort((a, b) => a.browserPath.localeCompare(b.browserPath))
  .map(({ sourceId, sourcePath, browserPath, sha256: hash, specificity, name, browsable }) => ({
    sourceId,
    sourcePath,
    browserPath,
    sha256: hash,
    specificity,
    ...(name ? { name } : {}),
    ...(browsable === false ? { browsable: false } : {}),
  }));

const manifest = {
  schemaVersion: 2,
  generationVersion: "2026-08-20",
  count: entries.length,
  sources: lock.sources.map((source) => source.provider),
  entries: entries.sort((a, b) => a.type.localeCompare(b.type)),
  aliases: legacyAliases,
  collisions: collisionLog.sort((a, b) => a.resolvedType.localeCompare(b.resolvedType)),
  assetFiles,
};

const missing = assetFiles.filter((asset) => !existsSync(join(ROOT, asset.sourcePath)));
if (missing.length) {
  throw new Error(`Missing referenced SVGs: ${missing.map((asset) => asset.sourcePath).join(", ")}`);
}

mkdirSync(join(ROOT, "packages/catalog/src/generated"), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${entries.length} canonical catalog entries and ${assetFiles.length} browser assets to ${OUT}`);
