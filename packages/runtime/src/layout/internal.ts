import type { GroupGeom, ID, NodeGeom } from "../core/index.js";

export interface LayoutState {
  nodeGeoms: Map<ID, NodeGeom>;
  groupGeoms: Map<ID, GroupGeom>;
}
