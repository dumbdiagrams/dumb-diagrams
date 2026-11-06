import type { GroupGeom, ID, NodeGeom } from "../core/index.js";

export interface LayoutState {
  compoundFlow?: boolean;
  hideResourceLabels?: boolean;
  nodeGeoms: Map<ID, NodeGeom>;
  groupGeoms: Map<ID, GroupGeom>;
}
