import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function verifyNpmRelease({
  packageName,
  version,
  integrity,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  timeoutMs = 15 * 60_000,
  intervalMs = 15_000,
  log = console.log,
}) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`;
  const deadline = now() + timeoutMs;
  let lastError = "No registry response";
  for (let attempt = 1; now() < deadline; attempt++) {
    let metadata;
    try {
      const response = await fetchImpl(url, {
        headers: { "Cache-Control": "no-cache", Accept: "application/json" },
        signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - now()))),
      });
      if (response.ok) metadata = await response.json();
      else if (response.status === 404 || response.status === 429 || response.status >= 500) {
        lastError = `Registry returned HTTP ${response.status}`;
      } else {
        throw new Error(`Non-retryable registry response: HTTP ${response.status}`);
      }
    } catch (error) {
      if (error.message.startsWith("Non-retryable")) throw error;
      lastError = error.message;
    }
    if (metadata) {
      if (metadata.name !== packageName || metadata.version !== version || metadata.dist?.integrity !== integrity) {
        throw new Error(
          `Published artifact mismatch for ${packageName}@${version}: expected ${integrity}; ` +
            `received ${metadata.name}@${metadata.version}, integrity ${metadata.dist?.integrity ?? "missing"}`,
        );
      }
      log(`Verified ${packageName}@${version} and exact artifact integrity on npm`);
      return;
    }
    log(`Waiting for ${packageName}@${version} (attempt ${attempt}): ${lastError}`);
    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(intervalMs, remaining));
  }
  throw new Error(
    `npm publication was accepted, but registry verification did not complete within ${timeoutMs / 60_000} minutes. ` +
      `Last error: ${lastError}. Do not republish this version; rerun this verification script with ` +
      `PACKAGE_NAME=${packageName}, RELEASE_VERSION=${version}, EXPECTED_INTEGRITY=${integrity}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { PACKAGE_NAME: packageName, RELEASE_VERSION: version, ARTIFACT: artifact, EXPECTED_INTEGRITY } = process.env;
  const integrity = artifact
    ? `sha512-${createHash("sha512").update(readFileSync(artifact)).digest("base64")}`
    : EXPECTED_INTEGRITY;
  if (!packageName || !version || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity ?? "")) {
    throw new Error("Set PACKAGE_NAME, RELEASE_VERSION, and ARTIFACT (or EXPECTED_INTEGRITY)");
  }
  console.log(`Expected integrity: ${integrity}`);
  await verifyNpmRelease({ packageName, version, integrity });
}
