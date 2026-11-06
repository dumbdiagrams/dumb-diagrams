import type { DiagramDocument, Edge, Group, ID, Resource, View } from "./types.js";

export function createEmptyView(id: ID = "default"): View {
  return {
    id,
    places: Object.create(null) as View["places"],
    routes: Object.create(null) as View["routes"],
    annotations: Object.create(null) as NonNullable<View["annotations"]>,
  };
}

export function createEmptyDocument(id: ID): DiagramDocument {
  return {
    id,
    grammar: "aws",
    flow: "lr",
    resources: [],
    groups: [],
    edges: [],
    annotations: [],
    views: [createEmptyView()],
  };
}

export function getResource(doc: DiagramDocument, id: ID): Resource | undefined {
  return doc.resources.find((r) => r.id === id);
}

export function getGroup(doc: DiagramDocument, id: ID): Group | undefined {
  return doc.groups.find((g) => g.id === id);
}

export function getEdge(doc: DiagramDocument, id: ID): Edge | undefined {
  return doc.edges.find((e) => e.id === id);
}

/** The main path: solid arrows that are not failure or peer links. */
export function isPrimaryFlowEdge(edge: Edge): boolean {
  return edge.style !== "dashed" && edge.kind !== "fail" && edge.kind !== "peer";
}

export function getDefaultView(doc: DiagramDocument): View {
  return doc.views.find((v) => v.id === "default") ?? doc.views[0]!;
}

export function allNodeIds(doc: DiagramDocument): ID[] {
  return [...doc.groups.map((g) => g.id), ...doc.resources.map((r) => r.id)];
}

export function getParentGroup(doc: DiagramDocument, childId: ID): Group | undefined {
  return doc.groups.find((g) => g.children.includes(childId) || g.borderChildren?.some((b) => b.id === childId));
}

export function getChildren(doc: DiagramDocument, groupId: ID): Array<Resource | Group> {
  const group = getGroup(doc, groupId);
  if (!group) return [];
  const items: Array<Resource | Group> = [];
  for (const id of group.children) {
    const g = getGroup(doc, id);
    const r = getResource(doc, id);
    if (g) items.push(g);
    else if (r) items.push(r);
  }
  return items;
}
