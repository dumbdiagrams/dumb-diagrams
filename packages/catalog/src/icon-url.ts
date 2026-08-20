/** Browser-safe URL for a repo-relative catalog icon path. */
export function catalogIconUrl(iconPath: string): string {
  const encoded = iconPath
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (typeof document !== "undefined") {
    return new URL(encoded, document.baseURI).toString();
  }
  return `/${encoded}`;
}
