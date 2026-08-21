import type { DiagramDocument } from "@dumb-diagrams/core";
import { DIAGRAM_LIMITS, getDefaultView } from "@dumb-diagrams/core";

import type { Selection, SelectionItem } from "../editor-model";
import { IconEye, IconEyeOff } from "../ui/icons";

export function LayersPanel({
  doc,
  selection,
  query,
  onQuery,
  onSelect,
  onToggleVisible,
  onToggleLocked,
}: {
  doc: DiagramDocument;
  selection: Selection;
  query: string;
  onQuery: (value: string) => void;
  onSelect: (item: SelectionItem, additive: boolean) => void;
  onToggleVisible: (item: SelectionItem) => void;
  onToggleLocked: (item: SelectionItem) => void;
}) {
  const view = getDefaultView(doc);
  const needle = query.trim().toLowerCase();
  const rows: Array<{ item: SelectionItem; label: string; depth: number }> = [];

  for (const group of doc.groups) {
    const label = group.label;
    if (needle && !label.toLowerCase().includes(needle) && !group.id.includes(needle)) {
      continue;
    }
    rows.push({ item: { kind: "group", id: group.id }, label, depth: depth(doc, group.id) });
  }
  for (const resource of doc.resources) {
    const label = resource.label.role ?? resource.label.service ?? resource.id;
    if (needle && !label.toLowerCase().includes(needle) && !resource.id.includes(needle)) {
      continue;
    }
    rows.push({ item: { kind: "resource", id: resource.id }, label, depth: depth(doc, resource.id) });
  }
  for (const edge of doc.edges) {
    const label = edge.label ?? edge.id;
    if (needle && !label.toLowerCase().includes(needle) && !edge.id.includes(needle)) {
      continue;
    }
    rows.push({ item: { kind: "edge", id: edge.id }, label, depth: 0 });
  }
  for (const annotation of doc.annotations) {
    if (needle && !annotation.text.toLowerCase().includes(needle) && !annotation.id.includes(needle)) {
      continue;
    }
    rows.push({ item: { kind: "annotation", id: annotation.id }, label: annotation.text, depth: 0 });
  }

  return (
    <div className="layers-panel">
      <input
        className="layers-search"
        value={query}
        maxLength={DIAGRAM_LIMITS.searchCharacters}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search layers"
        aria-label="Search layers"
      />
      <div className="layers-list" role="listbox">
        {rows.map((row) => {
          const place =
            row.item.kind === "annotation"
              ? view.annotations?.[row.item.id]
              : view.places[row.item.id];
          const selected = selection.some(
            (item) => item.kind === row.item.kind && item.id === row.item.id,
          );
          return (
            <div
              key={`${row.item.kind}-${row.item.id}`}
              className={`layer-row${selected ? " is-selected" : ""}`}
              style={{ paddingLeft: `${12 + row.depth * 14}px` }}
              role="option"
              aria-selected={selected}
            >
              <button
                type="button"
                className="layer-select"
                onClick={(event) => onSelect(row.item, event.shiftKey)}
              >
                <span className="layer-kind">{row.item.kind}</span>
                <span className="layer-label">{row.label}</span>
              </button>
              <div className="layer-actions">
                <button
                  type="button"
                  className={`layer-visibility-toggle${place?.visible === false ? " is-hidden" : ""}`}
                  data-layer-visibility={row.item.id}
                  data-visible={place?.visible === false ? "false" : "true"}
                  aria-label={place?.visible === false ? "Show" : "Hide"}
                  title={place?.visible === false ? "Show layer" : "Hide layer"}
                  onClick={() => onToggleVisible(row.item)}
                >
                  {place?.visible === false ? <IconEyeOff className="layer-visibility-icon" /> : <IconEye className="layer-visibility-icon" />}
                </button>
                <button
                  type="button"
                  className={`layer-lock-toggle${place?.locked ? " is-locked" : ""}`}
                  data-layer-lock={row.item.id}
                  data-locked={place?.locked ? "true" : "false"}
                  aria-label={place?.locked ? "Unlock" : "Lock"}
                  title={place?.locked ? "Unlock position" : "Lock position"}
                  onClick={() => onToggleLocked(row.item)}
                >
                  <LockIcon locked={place?.locked === true} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      className={`layer-lock-icon${locked ? " is-locked" : " is-unlocked"}`}
      viewBox="0 0 24 24"
      role="img"
      aria-hidden="true"
    >
      <rect className="lock-body" x="5" y="10" width="14" height="10" rx="2" />
      {locked ? (
        <path className="lock-shackle" d="M8 10V7a4 4 0 0 1 8 0v3" />
      ) : (
        <>
          <path className="lock-shackle" d="M8 10V7a4 4 0 0 1 7.5-2.6" />
          <path className="lock-shackle lock-shackle-open" d="M17 10V8.5" />
        </>
      )}
      <circle className="lock-keyhole" cx="12" cy="14" r="1.25" />
      <path className="lock-keyhole-stem" d="M12 15.25v2" />
    </svg>
  );
}

function depth(doc: DiagramDocument, id: string): number {
  const resource = doc.resources.find((candidate) => candidate.id === id);
  const group = doc.groups.find((candidate) => candidate.id === id);
  const parent = resource?.parent ?? group?.parent;
  return parent ? 1 + depth(doc, parent) : 0;
}
