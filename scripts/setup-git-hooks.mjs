import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const hooksPath = ".githooks";

if (!existsSync(".git") || !existsSync(hooksPath)) {
  process.exit(0);
}

let current = "";
try {
  current = execFileSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim();
} catch {
  // unset
}

if (current === hooksPath) {
  process.exit(0);
}

execFileSync("git", ["config", "core.hooksPath", hooksPath], { stdio: "inherit" });
console.log("Git hooks: .githooks (pre-commit fixes Biome on staged files; pre-push runs pnpm check:pr).");
