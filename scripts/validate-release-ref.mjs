import { execFileSync } from "node:child_process";

const ref = process.env.RELEASE_REF;
if (!/^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(ref ?? "")) {
  throw new Error(`Expected an exact semver release tag such as v0.1.0, got ${ref ?? "<missing>"}`);
}

try {
  execFileSync("git", ["show-ref", "--verify", "--quiet", `refs/tags/${ref}`]);
} catch {
  throw new Error(`${ref} is not an existing tag in the checked-out repository`);
}

console.log(`Validated release ref ${ref}`);
