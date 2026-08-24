import { DIAGRAM_LIMITS, utf8ByteLength } from "@dumb-diagrams/runtime/core";

const DRAFT_KEY = "dumb-diagrams:draft";

export function loadDraft(): { source: string; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw || utf8ByteLength(raw) > DIAGRAM_LIMITS.sourceBytes + 1024) return null;
    const parsed = JSON.parse(raw) as { source?: string; savedAt?: number };
    if (!parsed.source || utf8ByteLength(parsed.source) > DIAGRAM_LIMITS.sourceBytes) return null;
    return { source: parsed.source, savedAt: parsed.savedAt ?? 0 };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore.
  }
}
