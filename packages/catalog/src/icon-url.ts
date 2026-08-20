/** Browser-safe URL for a repo-relative catalog icon path. */
export function catalogIconUrl(iconPath: string): string {
  const encoded = iconPath
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (typeof document !== "undefined") {
    try {
      return new URL(encoded, document.baseURI).toString();
    } catch {
      // A non-browser consumer may provide a partial document shim. Keep the
      // resolver useful there instead of turning an unavailable base into a
      // render-wide exception.
    }
  }
  return `/${encoded}`;
}
