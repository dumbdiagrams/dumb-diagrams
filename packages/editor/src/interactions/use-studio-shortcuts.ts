import { useEffect, useRef } from "react";
import type { Command } from "../panels/CommandPalette";

const FILE_SHORTCUTS: Record<string, string> = {
  KeyN: "command-new",
  KeyO: "command-open",
  KeyS: "command-save",
  KeyW: "command-close-tab",
};
const EDIT_SHORTCUTS: Record<string, string> = {
  KeyG: "command-group",
  KeyZ: "command-undo",
  KeyY: "command-redo",
  KeyA: "command-select-all",
  KeyC: "command-copy",
  KeyX: "command-cut",
  KeyV: "command-paste",
  KeyD: "command-duplicate-selection",
};

function isTypingField(element: HTMLElement): boolean {
  if (element.closest(".cm-editor") || element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return !["file", "button", "submit", "reset", "checkbox", "radio", "hidden", "range", "color"].includes(element.type);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLElement && isTypingField(target)) ||
    (document.activeElement instanceof HTMLElement && isTypingField(document.activeElement))
  );
}

type ShortcutOptions = {
  ready: boolean;
  commands: Command[];
  onOpenPalette: () => void;
  onEscape: () => void;
  onNudge: (dx: number, dy: number) => void;
};

/** The command palette and keyboard share actions; modal and text input own their keys. */
export function useStudioShortcuts(options: ShortcutOptions): void {
  const current = useRef(options);
  current.current = options;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) {
        // WebKit can navigate back on Backspace outside an editable field.
        if (!isEditableTarget(event.target) && (event.key === "Backspace" || event.key === "Delete")) {
          event.preventDefault();
        }
        return;
      }
      const { ready, commands, onOpenPalette, onEscape, onNudge } = current.current;
      const mod = event.metaKey || event.ctrlKey;
      if (!ready) {
        if (mod) event.preventDefault();
        return;
      }
      const run = (id: string) => {
        event.preventDefault();
        const command = commands.find((candidate) => candidate.id === id);
        if (command && !command.disabled) command.onSelect();
      };
      if (mod && event.code === "KeyK") {
        event.preventDefault();
        onOpenPalette();
        return;
      }
      if (mod && FILE_SHORTCUTS[event.code]) {
        run(event.shiftKey && event.code === "KeyS" ? "command-save-as" : FILE_SHORTCUTS[event.code]!);
        return;
      }
      if (isEditableTarget(event.target)) return;
      if (!mod && event.target instanceof Element && event.target.closest(".workspace-tabs, .entity-navigator")) return;
      if (mod && EDIT_SHORTCUTS[event.code]) {
        const shifted =
          event.shiftKey && event.code === "KeyZ"
            ? "command-redo"
            : event.shiftKey && event.code === "KeyG"
              ? "command-ungroup"
              : EDIT_SHORTCUTS[event.code]!;
        run(shifted);
        return;
      }
      if (event.key === "Escape") onEscape();
      if (event.key === "Backspace" || event.key === "Delete") run("command-delete-selection");
      if (!mod && event.code === "KeyV") run("command-select");
      if (!mod && event.code === "KeyT") run("command-text");
      if (!mod && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        const step = event.shiftKey ? 32 : 8;
        event.preventDefault();
        onNudge(
          event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
          event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
        );
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
