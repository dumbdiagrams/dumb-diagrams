import type { GroupGeom, ID, NodeGeom } from "@dumb-diagrams/core";

export interface LayoutState {
  nodeGeoms: Map<ID, NodeGeom>;
  groupGeoms: Map<ID, GroupGeom>;
}
