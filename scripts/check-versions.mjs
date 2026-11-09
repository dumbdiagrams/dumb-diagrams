import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { releaseHasNotes } from "./lib/changelog.mjs";

const root = new URL("../", import.meta.url);
const rootPath = root.pathname;
const packagesRoot = join(rootPath, "packages");
const packages = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(join(packagesRoot, name, "package.json")))
  .sort();
const versions = packages.map((name) => {
  const filename = join(packagesRoot, name, "package.json");
  const manifest = JSON.parse(readFileSync(filename, "utf8"));
  return { name: manifest.name, version: manifest.version, license: manifest.license };
});
const uniqueVersions = new Set(versions.map((entry) => entry.version));
const version = [...uniqueVersions][0];
const rootLicense = JSON.parse(readFileSync(join(rootPath, "package.json"), "utf8")).license;

if (uniqueVersions.size !== 1 || !version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Workspace package versions must be one valid SemVer value:");
  for (const entry of versions) console.error(`- ${entry.name}: ${entry.version ?? "missing"}`);
  process.exit(1);
}
if (!rootLicense || versions.some((entry) => entry.license !== rootLicense)) {
  console.error(`Workspace package licenses must match the root license (${rootLicense ?? "missing"}):`);
  for (const entry of versions) console.error(`- ${entry.name}: ${entry.license ?? "missing"}`);
  process.exit(1);
}

const tag = `v${version}`;
const changelog = readFileSync(join(rootPath, "CHANGELOG.md"), "utf8");
const releaseDoc = readFileSync(join(rootPath, "docs/RELEASE.md"), "utf8");
const changelogErrors = [];

if (!changelog.includes(`## [${version}]`)) {
  changelogErrors.push(`CHANGELOG.md is missing a [${version}] section`);
} else if (!releaseHasNotes(changelog, version)) {
  changelogErrors.push(`CHANGELOG.md [${version}] section needs release notes, not just a heading`);
}
if (!releaseDoc.includes(tag)) {
  changelogErrors.push(`docs/RELEASE.md does not reference tag ${tag}`);
}

if (changelogErrors.length) {
  console.error("Release documentation must match the workspace version:");
  for (const message of changelogErrors) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`OK ${versions.length} workspace packages at ${version}`);
console.log(`OK workspace package licenses match ${rootLicense}`);
console.log(`OK changelog and release docs reference ${tag}`);
