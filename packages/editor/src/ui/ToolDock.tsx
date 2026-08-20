import type { ComponentType } from "react";

import {
  IconCode,
  IconConnector,
  IconGroups,
  IconLayers,
  IconNote,
  IconResources,
  IconSelect,
} from "./icons";

export type ToolId = "select" | "resources" | "groups" | "connector" | "code" | "layers" | "note";

const TOOLS: Array<{
  id: ToolId;
  label: string;
  shortcut?: string;
  Icon: ComponentType;
}> = [
  { id: "select", label: "Select", shortcut: "V", Icon: IconSelect },
  { id: "resources", label: "Resources", Icon: IconResources },
  { id: "groups", label: "Groups", Icon: IconGroups },
  { id: "connector", label: "Connector", shortcut: "C", Icon: IconConnector },
  { id: "layers", label: "Layers", Icon: IconLayers },
  { id: "note", label: "Add note", Icon: IconNote },
  { id: "code", label: "Source", Icon: IconCode },
];

export function ToolDock({
  active,
  onChange,
}: {
  active: ToolId;
  onChange: (tool: ToolId) => void;
}) {
  return (
    <nav className="tool-dock" aria-label="Diagram tools">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={active === tool.id ? "is-active" : ""}
          onClick={() => onChange(tool.id)}
          title={`${tool.label}${tool.shortcut ? ` (${tool.shortcut})` : ""}`}
          aria-label={tool.label}
          aria-pressed={active === tool.id}
        >
          <tool.Icon />
        </button>
      ))}
    </nav>
  );
}
