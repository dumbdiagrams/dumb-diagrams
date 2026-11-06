import { validateImportedSource } from "./document-import";
import { decodeDiagramUrlPayload } from "./export-actions";

export type DiagramUrlImport = { source?: string; error?: string };

/** Read a shared `#diagram=` link. Only a valid, safe diagram is opened. */
export function readDiagramUrlImport(hash: string): DiagramUrlImport {
  if (!hash) return {};
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.size !== 1 || !params.has("diagram")) {
    return { error: "Diagram URL contains an unsupported hash." };
  }
  const decoded = decodeDiagramUrlPayload(params.get("diagram") ?? "");
  if (!decoded.ok) return { error: decoded.message };
  return validateImportedSource(decoded.source, false).match(
    (source) => ({ source }),
    () => ({ error: "Diagram URL contains invalid diagram source." }),
  );
}

export function clearDiagramHash(): void {
  if (typeof window === "undefined" || !window.location.hash) return;
  try {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  } catch {
    window.location.hash = "";
  }
}
