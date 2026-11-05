import type { DiagramDocument, Group, ID } from "../core/index.js";

/** Causal tiers of a container's immediate children, including nested owners. */
export function childFlowLayers(doc: DiagramDocument, group: Group): ID[][] | undefined {
  if (doc.flow !== "lr" || group.children.length < 2) return undefined;
  const groups = new Map(doc.groups.map((item) => [item.id, item]));
  const resources = new Set(doc.resources.map((item) => item.id));
  const owners = new Map<ID, ID>();
  const collect = (id: ID, owner: ID): void => {
    if (resources.has(id)) owners.set(id, owner);
    else for (const child of groups.get(id)?.children ?? []) collect(child, owner);
  };
  for (const id of group.children) collect(id, id);
  const outgoing = new Map(group.children.map((id) => [id, new Set<ID>()]));
  const incoming = new Map(group.children.map((id) => [id, new Set<ID>()]));
  const ingress = new Map(group.children.map((id) => [id, 0]));
  const resourceEdges = new Map<ID, ID[]>();
  let relationships = 0;
  const connect = (source: ID, target: ID): void => {
    if (source === target || outgoing.get(source)!.has(target) || outgoing.get(target)!.has(source)) return;
    outgoing.get(source)!.add(target);
    incoming.get(target)!.add(source);
    relationships++;
  };
  for (const edge of doc.edges) {
    if (edge.style === "dashed" || edge.kind === "fail" || edge.kind === "peer") continue;
    const source = owners.get(edge.source);
    const target = owners.get(edge.target);
    const targets = resourceEdges.get(edge.source) ?? [];
    targets.push(edge.target);
    resourceEdges.set(edge.source, targets);
    if (!source && target) ingress.set(target, ingress.get(target)! + 1);
    if (source && target) connect(source, target);
  }
  // A regional pipeline can leave its region for a global queue and then
  // reenter at a worker. Project that causal path back onto local children;
  // otherwise the worker appears unrelated and can be placed before ingest.
  for (const edge of doc.edges) {
    if (edge.style === "dashed" || edge.kind === "fail" || edge.kind === "peer") continue;
    const source = owners.get(edge.source);
    if (!source) continue;
    const queue = [edge.target];
    const visited = new Set<ID>();
    for (let index = 0; index < queue.length; index++) {
      const targetId = queue[index]!;
      if (visited.has(targetId)) continue;
      visited.add(targetId);
      const target = owners.get(targetId);
      if (target) connect(source, target);
      else queue.push(...(resourceEdges.get(targetId) ?? []));
    }
  }
  if (!relationships) return undefined;

  // Remove sources and sinks first, then break feedback cycles at the most
  // outward-facing vertex. No relationship is removed from the document;
  // feedback edges simply travel back across the resulting tiers.
  const remaining = new Set(group.children);
  const before: ID[] = [];
  const after: ID[] = [];
  const authored = new Map(group.children.map((id, index) => [id, index]));
  const degree = (edges: Map<ID, Set<ID>>, id: ID) => [...edges.get(id)!].filter((item) => remaining.has(item)).length;
  const compare = (a: ID, b: ID) => ingress.get(b)! - ingress.get(a)! || authored.get(a)! - authored.get(b)!;
  while (remaining.size) {
    const source = [...remaining].filter((id) => degree(incoming, id) === 0).sort(compare)[0];
    if (source !== undefined) {
      before.push(source);
      remaining.delete(source);
      continue;
    }
    const sink = [...remaining]
      .filter((id) => degree(outgoing, id) === 0)
      .sort(compare)
      .at(-1);
    if (sink !== undefined) {
      after.unshift(sink);
      remaining.delete(sink);
      continue;
    }
    const next = [...remaining].sort(
      (a, b) =>
        degree(outgoing, b) - degree(incoming, b) - (degree(outgoing, a) - degree(incoming, a)) || compare(a, b),
    )[0]!;
    before.push(next);
    remaining.delete(next);
  }
  const order = [...before, ...after];
  const position = new Map(order.map((id, index) => [id, index]));
  const rank = new Map(order.map((id) => [id, 0]));
  for (const source of order) {
    for (const target of outgoing.get(source)!) {
      if (position.get(target)! > position.get(source)!)
        rank.set(target, Math.max(rank.get(target)!, rank.get(source)! + 1));
    }
  }
  const layers: ID[][] = Array.from({ length: Math.max(...rank.values()) + 1 }, () => []);
  for (const id of group.children) layers[rank.get(id)!]!.push(id);

  // Barycentric sweeps align branch and join partners. Stable authored ties
  // keep repeated rendering independent of locale and object-map ordering.
  for (let pass = 0; pass < 4; pass++) {
    const forward = pass % 2 === 0;
    const indices = layers.map((_, index) => index);
    if (!forward) indices.reverse();
    for (const layerIndex of indices) {
      const neighbors = forward ? incoming : outgoing;
      const cross = new Map(layers.flatMap((layer) => layer.map((id, index) => [id, index] as const)));
      const barycenter = (id: ID) => {
        const adjacent = [...neighbors.get(id)!].filter((other) =>
          forward ? rank.get(other)! < layerIndex : rank.get(other)! > layerIndex,
        );
        return adjacent.length
          ? adjacent.reduce((total, other) => total + cross.get(other)!, 0) / adjacent.length
          : cross.get(id)!;
      };
      layers[layerIndex]!.sort((a, b) => barycenter(a) - barycenter(b) || authored.get(a)! - authored.get(b)!);
    }
  }
  return layers;
}
