import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const remote = readGitRemote();
const repository = process.env.GITHUB_REPOSITORY || process.argv[2] || remote?.repository;
if (!repository) {
  throw new Error(
    "A repository owner/name is required when preparing npm publish metadata. " +
    "Set GITHUB_REPOSITORY, pass it as the first argument, or configure git remote.origin.",
  );
}

if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  throw new Error(`GITHUB_REPOSITORY is not a valid owner/name pair: ${repository}`);
}

const server = (process.env.GITHUB_SERVER_URL || remote?.server || "https://github.com").replace(/\/$/, "");
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

function readGitRemote() {
  try {
    const value = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const match = value.match(/^(?:https?:\/\/|ssh:\/\/git@|git@)([^/:]+)[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) return undefined;
    return { server: `https://${match[1]}`, repository: `${match[2]}/${match[3]}` };
  } catch {
    return undefined;
  }
}
