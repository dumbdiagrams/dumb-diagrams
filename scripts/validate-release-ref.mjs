import { execFileSync } from "node:child_process";

const ref = process.env.RELEASE_REF;
if (!/^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(ref ?? "")) {
  throw new Error(`Expected an exact semver release tag such as v0.1.0, got ${ref ?? "<missing>"}`);
}

function git(args, options = {}) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
}

function refExists(name) {
  try {
    git(["show-ref", "--verify", "--quiet", name]);
    return true;
  } catch {
    return false;
  }
}

let tagCommit;
try {
  tagCommit = git(["rev-parse", `refs/tags/${ref}^{commit}`]);
} catch {
  throw new Error(`${ref} is not an existing commit tag in the checked-out repository`);
}

const headCommit = git(["rev-parse", "HEAD"]);
if (tagCommit !== headCommit) {
  throw new Error(`${ref} does not point to the checked-out HEAD`);
}

function trustedOriginBranch() {
  let defaultRef;
  try {
    defaultRef = git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  } catch {
    // Older or manually configured clones may not have origin/HEAD. Fall back
    // to conventional default branch names, but only when their remote refs exist.
  }

  if (defaultRef) {
    if (!defaultRef.startsWith("origin/") || !refExists(`refs/remotes/${defaultRef}`)) {
      throw new Error(`origin/HEAD does not resolve to an available remote branch (${defaultRef})`);
    }
    return defaultRef;
  }

  for (const branch of ["main", "master"]) {
    const candidate = `origin/${branch}`;
    if (refExists(`refs/remotes/${candidate}`)) return candidate;
  }
  throw new Error(
    "No trusted origin default branch is available (expected origin/HEAD, origin/main, or origin/master)",
  );
}

const defaultBranch = trustedOriginBranch();
let isAncestor = false;
try {
  git(["merge-base", "--is-ancestor", tagCommit, defaultBranch]);
  isAncestor = true;
} catch {
  // Git exits 1 when the release commit is not reachable from the branch.
}
if (!isAncestor) {
  throw new Error(`${ref} is not reachable from the trusted default branch ${defaultBranch}`);
}

console.log(`Validated release ref ${ref} on ${defaultBranch}`);
