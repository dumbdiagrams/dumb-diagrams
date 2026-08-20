import { useState } from "react";

import { catalogIconUrl, type CatalogEntry } from "@dumb-diagrams/catalog";

export function CatalogAssetCard({
  entry,
  providerLabel,
  isFavorite,
  variant = "service",
  onActivate,
  onToggleFavorite,
}: {
  entry: CatalogEntry;
  providerLabel: string;
  isFavorite: boolean;
  variant?: "service" | "group";
  onActivate: () => void;
  onToggleFavorite: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const iconSize = variant === "group" ? 52 : 40;

  return (
    <div
      className={`palette-card${variant === "group" ? " is-group" : ""}`}
      data-catalog-type={entry.type}
      data-provider={entry.provider}
      data-asset-kind={variant === "group" ? "group" : "resource"}
      data-icon-status={status}
    >
      <button
        type="button"
        className="palette-item"
        onClick={onActivate}
        title={`${entry.name} · ${entry.type}`}
        aria-label={`Add ${entry.name}`}
      >
        <span className="palette-thumb">
          {status === "error" ? (
            <span className="palette-thumb-error" role="img" aria-label="Icon unavailable">!</span>
          ) : (
            <img
              src={catalogIconUrl(entry.browserPath)}
              alt=""
              width={iconSize}
              height={iconSize}
              decoding="async"
              onLoad={() => setStatus("loaded")}
              onError={() => setStatus("error")}
            />
          )}
        </span>
        <span className="palette-label" title={entry.name}>{entry.name}</span>
        {variant === "group" && entry.groupKind && (
          <span className="group-kind-badge">{entry.groupKind}</span>
        )}
        {variant === "service" && (
          <span className="palette-meta">
            <span className="provider-badge">{providerLabel}</span>
            {entry.categories.join(" · ")}
          </span>
        )}
      </button>
      <button
        type="button"
        className={`favorite-toggle${isFavorite ? " is-active" : ""}`}
        aria-label={isFavorite ? `Remove ${entry.name} from favorites` : `Add ${entry.name} to favorites`}
        aria-pressed={isFavorite}
        onClick={onToggleFavorite}
        title={isFavorite ? "Remove favorite" : "Add favorite"}
      >
        ★
      </button>
    </div>
  );
}
