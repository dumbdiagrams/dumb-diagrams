import type { ClipboardEvent as ReactClipboardEvent } from "react";
import { characterLength } from "@dumb-diagrams/runtime/core";

export function rejectOversizedPaste(
  event: ReactClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  limit: number,
  onReject: () => void,
): void {
  const target = event.currentTarget;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  const next = target.value.slice(0, start) + event.clipboardData.getData("text") + target.value.slice(end);
  if (characterLength(next) <= limit) return;
  event.preventDefault();
  onReject();
}
