import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packagesRoot = new URL("../packages/", import.meta.url);
const packages = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const versions = packages.map((name) => {
  const filename = join(packagesRoot.pathname, name, "package.json");
  const manifest = JSON.parse(readFileSync(filename, "utf8"));
  return { name: manifest.name, version: manifest.version };
});
const uniqueVersions = new Set(versions.map((entry) => entry.version));
const version = [...uniqueVersions][0];

if (uniqueVersions.size !== 1 || !version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Workspace package versions must be one valid SemVer value:");
  for (const entry of versions) console.error(`- ${entry.name}: ${entry.version ?? "missing"}`);
  process.exit(1);
}

console.log(`OK ${versions.length} workspace packages at ${version}`);
