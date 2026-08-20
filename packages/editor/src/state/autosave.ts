const DRAFT_KEY = "dumb-diagrams:draft";

export function saveDraft(source: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ source, savedAt: Date.now() }));
  } catch {
    // Ignore quota errors.
  }
}

export function loadDraft(): { source: string; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { source?: string; savedAt?: number };
    if (!parsed.source) return null;
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
