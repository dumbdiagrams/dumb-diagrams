// Reviewed per-prompt reference contracts, matched by catalog type,
// containment, and edge direction instead of the model's own IDs.
//
// examples/prompts/<id>.reference.json:
//   roles:     { name: { types: [catalog types], within?: role, outside?: role } }
//   edges:     ["a -> b" (that direction), "a -- b" (either direction),
//               "a ~> b" (a directed path, for "through" phrasing);
//               "x | y" accepts either alternative for an ambiguous prompt]
//   exclusive: true when the prompt says to add no other services/resources

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { repoRoot } from "./example-manifest.mjs";

// ponytail: exhaustive search over type-compatible role bindings; capped, and
// the prompts bind at most a few same-typed roles, so the cap is never reached.
const MAX_BINDINGS = 200_000;

export function referencePath(promptId) {
  return resolve(repoRoot(), "examples/prompts", `${promptId}.reference.json`);
}

export function loadReference(promptId) {
  const path = referencePath(promptId);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

export function parseReferenceEdge(edge) {
  const alternatives = edge.split(" | ").map((text) => {
    const match = /^(\S+) (->|--|~>) (\S+)$/.exec(text);
    if (!match) throw new Error(`Invalid reference edge: ${edge}`);
    return { from: match[1], to: match[3], either: match[2] === "--", path: match[2] === "~>" };
  });
  return { alternatives, text: edge };
}

/** Best role binding for `doc`; `failures` lists every unmet constraint. */
export function matchReference(doc, reference) {
  const elements = [
    ...doc.resources.map((item) => ({ id: item.id, type: item.type, parent: item.parent, resource: true })),
    ...doc.groups.map((item) => ({ id: item.id, type: item.type ?? item.kind, parent: item.parent, resource: false })),
  ];
  const parents = new Map(elements.map((item) => [item.id, item.parent]));
  const ancestors = (id) => {
    const chain = [];
    for (let parent = parents.get(id); parent; parent = parents.get(parent)) chain.push(parent);
    return chain;
  };
  const roles = Object.entries(reference.roles).map(([name, role]) => ({
    name,
    ...role,
    candidates: elements.filter((item) => role.types.includes(item.type)).map((item) => item.id),
  }));
  roles.sort((a, b) => a.candidates.length - b.candidates.length || a.name.localeCompare(b.name));
  const edges = (reference.edges ?? []).map(parseReferenceEdge);
  const connected = (source, target) =>
    doc.edges.some(
      (edge) =>
        (edge.source === source && edge.target === target) ||
        (edge.kind === "bidirectional" && edge.source === target && edge.target === source),
    );

  const reachable = (source, target) => {
    const seen = new Set([source]);
    for (const queue = [source]; queue.length; ) {
      const current = queue.shift();
      for (const edge of doc.edges) {
        const next =
          edge.source === current
            ? edge.target
            : edge.kind === "bidirectional" && edge.target === current
              ? edge.source
              : undefined;
        if (next === target) return true;
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return false;
  };

  const evaluate = (binding) => {
    const failures = [];
    let failed = 0;
    const fail = (message, weight = 1) => {
      failures.push(message);
      failed += weight;
    };
    for (const role of roles) {
      const id = binding.get(role.name);
      if (!id) {
        fail(`missing ${role.name} (${role.types.join(" | ")})`, 1 + (role.within ? 1 : 0) + (role.outside ? 1 : 0));
        continue;
      }
      if (role.within && !ancestors(id).includes(binding.get(role.within)))
        fail(`${role.name} is not inside ${role.within}`);
      if (role.outside && binding.get(role.outside) && ancestors(id).includes(binding.get(role.outside)))
        fail(`${role.name} is inside ${role.outside}`);
    }
    for (const edge of edges) {
      const linked = edge.alternatives.some((option) => {
        const from = binding.get(option.from);
        const to = binding.get(option.to);
        if (!from || !to) return false;
        if (option.path) return reachable(from, to);
        return connected(from, to) || (option.either && connected(to, from));
      });
      if (!linked) fail(`missing edge ${edge.text}`);
    }
    if (reference.exclusive) {
      const bound = new Set(binding.values());
      const extra = doc.resources.filter((item) => !bound.has(item.id)).map((item) => `${item.id} (${item.type})`);
      if (extra.length) fail(`unrequested resources: ${extra.join(", ")}`);
    }
    return { failures, failed };
  };

  let best;
  let visited = 0;
  const used = new Set();
  const binding = new Map();
  const search = (index) => {
    if (visited >= MAX_BINDINGS) return;
    if (index === roles.length) {
      visited++;
      const result = evaluate(binding);
      if (!best || result.failed < best.failed) best = { ...result, binding: new Map(binding) };
      return;
    }
    const role = roles[index];
    const free = role.candidates.filter((id) => !used.has(id));
    if (!free.length) return search(index + 1);
    for (const id of free) {
      used.add(id);
      binding.set(role.name, id);
      search(index + 1);
      binding.delete(role.name);
      used.delete(id);
      if (best && !best.failed) return;
    }
  };
  search(0);
  const total =
    roles.length +
    roles.filter((role) => role.within).length +
    roles.filter((role) => role.outside).length +
    edges.length +
    (reference.exclusive ? 1 : 0);
  return {
    total,
    satisfied: total - best.failed,
    failures: best.failures,
    binding: Object.fromEntries(best.binding),
    exhausted: visited >= MAX_BINDINGS,
  };
}
