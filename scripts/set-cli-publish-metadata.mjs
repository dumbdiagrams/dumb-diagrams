import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repository = process.env.GITHUB_REPOSITORY;
if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required when preparing npm publish metadata.");
}

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error(`GITHUB_REPOSITORY is not a valid owner/name pair: ${repository}`);
}

const server = (process.env.GITHUB_SERVER_URL || "https://github.com").replace(/\/$/, "");
const repositoryUrl = `${server}/${repository}`;
const packagePath = join(process.cwd(), "packages/cli/package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

packageJson.repository = {
  type: "git",
  url: `git+${repositoryUrl}.git`,
  directory: "packages/cli",
};
packageJson.homepage = repositoryUrl;
packageJson.bugs = { url: `${repositoryUrl}/issues` };

writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Configured npm metadata for ${repositoryUrl}`);
