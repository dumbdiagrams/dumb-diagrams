import type { ComponentType } from "react";

import {
  IconCode,
  IconConnector,
  IconGroups,
  IconLayers,
  IconNote,
  IconResources,
  IconSelect,
  IconText,
} from "./icons";

export type ToolId = "select" | "resources" | "groups" | "connector" | "code" | "layers" | "note" | "text";

const TOOLS: Array<{
  id: ToolId;
  label: string;
  shortcut?: string;
  Icon: ComponentType;
}> = [
  { id: "select", label: "Select", shortcut: "V", Icon: IconSelect },
  { id: "groups", label: "Groups", Icon: IconGroups },
  { id: "resources", label: "Resources", Icon: IconResources },
  { id: "text", label: "Text", shortcut: "T", Icon: IconText },
  { id: "note", label: "Add note", Icon: IconNote },
  { id: "connector", label: "Connector", shortcut: "C", Icon: IconConnector },
  { id: "layers", label: "Layers", Icon: IconLayers },
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
