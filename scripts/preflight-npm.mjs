import { spawnSync } from "node:child_process";

const registry = "https://registry.npmjs.org";
const packageName = "dumbdiagrams";

const packageInfo = npm(["view", packageName, "maintainers", "--json"]);
const identity = npm(["whoami"]);

if (packageInfo.status === 0) {
  if (identity.status !== 0) {
    fail(
      `${packageName} already exists, but npm authentication could not be checked.\n` +
      `Run: npm login --registry=${registry}`,
    );
  }
  const username = identity.stdout.trim();
  const maintainers = parseMaintainers(packageInfo.stdout);
  if (!maintainers.includes(username)) {
    fail(
      `${packageName} already exists and is not maintained by ${username}. ` +
      "Choose another package name before publishing.",
    );
  }
  console.log(`OK ${username} is a maintainer of existing package ${packageName}`);
} else if (isNotFound(packageInfo)) {
  console.log(`OK ${packageName} is currently available on ${registry}`);
} else {
  fail(`Could not check ownership of ${packageName}`, packageInfo);
}

if (identity.status !== 0) {
  fail(
    "Not authenticated to the public npm registry.\n" +
    `Run: npm login --registry=${registry}`,
  );
}
const username = identity.stdout.trim();
console.log(`OK authenticated to ${registry} as ${username}`);
console.log("Preflight passed. No package was published.");

function npm(args) {
  return spawnSync(
    "npm",
    [...args, `--registry=${registry}`],
    { encoding: "utf8" },
  );
}

function parseMaintainers(output) {
  const parsed = JSON.parse(output);
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  return entries.map((entry) => {
    if (typeof entry === "string") return entry.split("<", 1)[0].trim();
    return entry?.name ?? "";
  }).filter(Boolean);
}

function isNotFound(result) {
  return `${result.stdout}\n${result.stderr}`.includes("E404");
}

function fail(message, result) {
  console.error(message);
  if (result?.stderr?.trim()) console.error(result.stderr.trim());
  process.exit(1);
}
