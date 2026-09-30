import { builtinModules } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";

const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const workspacePackages = new Map([
  ["@dumb-diagrams/runtime", "runtime"], ["@dumb-diagrams/editor", "editor"],
  ["create-dumb-diagrams", "cli"], ["@dumb-diagrams/website", "website"], ["@dumb-diagrams/brand", "brand"],
]);
const dependencies = {
  runtime: new Set(["runtime"]),
  editor: new Set(["editor", "runtime", "brand"]),
  cli: new Set(["cli", "runtime"]),
  website: new Set(["website", "runtime", "brand"]),
  brand: new Set(["brand"]),
};

/** Production workspace directions; test fixtures and build tooling are checked separately. */
export function importBoundaryError(root, file, specifier) {
  const path = relative(root, file).split(sep).join("/");
  const match = /^packages\/([^/]+)\/src\//.exec(path);
  if (!match || /\.(?:test|spec)\./.test(path)) return undefined;
  const owner = match[1];
  if (!dependencies[owner]) return undefined;
  if ((owner === "runtime" || owner === "editor") && (builtins.has(specifier) || specifier.startsWith("node:"))) {
    return `${owner} browser source must not import Node built-ins (${specifier})`;
  }
  if (owner === "runtime" && /^(?:react|react-dom)(?:\/|$)/.test(specifier)) {
    return "runtime must not depend on React";
  }
  let target;
  for (const [name, directory] of workspacePackages) {
    if (specifier === name || specifier.startsWith(`${name}/`)) target = directory;
  }
  if (specifier.startsWith(".")) {
    const resolved = relative(root, resolve(dirname(file), specifier)).split(sep).join("/");
    target = /^packages\/([^/]+)\//.exec(resolved)?.[1];
    if (target && target !== owner) return "cross-package imports must use the package's public exports";
    if (owner === "editor" && /^packages\/editor\/src\/model\//.test(path) &&
      /^packages\/editor\/src\/(?:canvas|panels|ui|state|interactions)\//.test(resolved)) {
      return "editor model must not depend on UI or state controllers";
    }
  }
  if (target && !dependencies[owner].has(target)) return `${owner} must not depend on ${target}`;
  return undefined;
}
