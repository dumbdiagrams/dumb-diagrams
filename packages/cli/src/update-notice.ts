const PACKAGE_METADATA_URL = "https://registry.npmjs.org/create-dumb-diagrams";
const LOOKUP_TIMEOUT_MS = 1_000;

interface ParsedVersion {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: readonly (bigint | string)[];
}

export type CliVersionStatus =
  | { status: "latest" | "update-available" | "ahead"; latestVersion: string }
  | { status: "unavailable" };

export async function checkCliVersion(installedVersion: string): Promise<CliVersionStatus> {
  const installed = parseVersion(installedVersion);
  if (!installed) return { status: "unavailable" };

  try {
    const response = await fetch(PACKAGE_METADATA_URL, {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return { status: "unavailable" };

    const payload = (await response.json()) as { "dist-tags"?: { latest?: unknown } };
    const latestVersion = payload["dist-tags"]?.latest;
    if (typeof latestVersion !== "string") return { status: "unavailable" };

    const latest = parseVersion(latestVersion);
    if (!latest) return { status: "unavailable" };
    const comparison = compareVersions(latest, installed);
    return { status: comparison > 0 ? "update-available" : comparison < 0 ? "ahead" : "latest", latestVersion };
  } catch {
    return { status: "unavailable" };
  }
}

function parseVersion(value: string): ParsedVersion | undefined {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      value,
    );
  if (!match) return undefined;

  const prerelease = (match[4]?.split(".") ?? []).map((identifier) => {
    if (/^\d+$/.test(identifier)) {
      if (identifier.length > 1 && identifier.startsWith("0")) return undefined;
      return BigInt(identifier);
    }
    return identifier;
  });
  if (prerelease.some((identifier) => identifier === undefined)) return undefined;

  return {
    major: BigInt(match[1]!),
    minor: BigInt(match[2]!),
    patch: BigInt(match[3]!),
    prerelease: prerelease as readonly (bigint | string)[],
  };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }

  if (!left.prerelease.length || !right.prerelease.length) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length ? -1 : 1;
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    if (typeof leftIdentifier === "bigint" && typeof rightIdentifier === "string") return -1;
    if (typeof leftIdentifier === "string" && typeof rightIdentifier === "bigint") return 1;
    if (typeof leftIdentifier === "bigint" && typeof rightIdentifier === "bigint") {
      return leftIdentifier > rightIdentifier ? 1 : -1;
    }
    if (typeof leftIdentifier === "string" && typeof rightIdentifier === "string") {
      return leftIdentifier > rightIdentifier ? 1 : -1;
    }
  }
  return 0;
}
