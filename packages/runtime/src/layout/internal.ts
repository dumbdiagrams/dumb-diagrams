import type { GroupGeom, ID, NodeGeom } from "../core/index.js";

export interface LayoutState {
  compoundFlow?: boolean;
  nodeGeoms: Map<ID, NodeGeom>;
  groupGeoms: Map<ID, GroupGeom>;
}
