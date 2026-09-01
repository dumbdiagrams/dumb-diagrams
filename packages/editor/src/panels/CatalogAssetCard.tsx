import { useEffect, useRef, useState } from "react";

import { catalogIconUrl, type CatalogEntry } from "@dumb-diagrams/runtime/catalog";

import {
  CATALOG_DRAG_MIME,
  serializeCatalogDragPayload,
} from "../catalog-dnd";
import { ProviderMark } from "./ProviderMark";

const ICON_RETRY_DELAYS_MS = [250, 500, 1_000, 2_000] as const;

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
  const [status, setStatus] = useState<"loading" | "loaded" | "retrying" | "error">("loading");
  const [retryCount, setRetryCount] = useState(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const iconSize = variant === "group" ? 52 : 40;
  const iconUrl = catalogIconUrl(entry.browserPath);
  const iconRef = useRef<HTMLImageElement>(null);
  const iconSrc = retryCount
    ? `${iconUrl}${iconUrl.includes("?") ? "&" : "?"}icon-retry=${retryCount}`
    : iconUrl;

  useEffect(() => {
    setStatus("loading");
    setRetryCount(0);
    return () => {
      if (retryTimer.current !== undefined) window.clearTimeout(retryTimer.current);
    };
  }, [entry.browserPath]);

  useEffect(() => {
    const image = iconRef.current;
    if (image?.complete && image.naturalWidth > 0) setStatus("loaded");
  }, [iconSrc]);

  const handleIconError = () => {
    if (retryCount >= ICON_RETRY_DELAYS_MS.length) {
      setStatus("error");
      return;
    }
    setStatus("retrying");
    if (retryTimer.current !== undefined) window.clearTimeout(retryTimer.current);
    retryTimer.current = window.setTimeout(() => {
      setRetryCount((current) => current + 1);
    }, ICON_RETRY_DELAYS_MS[retryCount] ?? ICON_RETRY_DELAYS_MS.at(-1)!);
  };

  return (
    <div
      className={`palette-card${variant === "group" ? " is-group" : ""}`}
      data-catalog-type={entry.type}
      data-provider={entry.provider}
      data-asset-kind={variant === "group" ? "group" : "resource"}
      data-icon-status={status}
      data-icon-browser-path={entry.browserPath}
    >
      <button
        type="button"
        className="palette-item"
        onClick={onActivate}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(
            CATALOG_DRAG_MIME,
            serializeCatalogDragPayload(entry),
          );
          event.dataTransfer.setData("text/plain", entry.type);
        }}
        title={`${entry.name} · ${entry.type} · Click to add or drag to the canvas`}
        aria-label={`Add ${entry.name}`}
      >
        <span className="palette-thumb">
          {status === "error" ? (
            <span
              className="palette-thumb-error"
              role="img"
              aria-label="Icon unavailable"
              title={`Icon unavailable: ${entry.name}`}
            >
              !
            </span>
          ) : (
            <img
              ref={iconRef}
              src={iconSrc}
              alt=""
              width={iconSize}
              height={iconSize}
              // The catalog is already rendered inside its own scroll grid. Native lazy
              // loading combined with content-visibility on the cards can leave visible
              // cards in a permanent browser "broken image" state in Chromium.
              loading="eager"
              fetchPriority="low"
              decoding="async"
              onLoad={() => setStatus("loaded")}
              onError={handleIconError}
            />
          )}
        </span>
        <span className="palette-label" title={entry.name}>{entry.name}</span>
        {variant === "group" && entry.groupKind && (
          <span className="group-card-meta">
            <ProviderMark provider={entry.provider} />
            <span className="group-kind-badge">{entry.groupKind}</span>
          </span>
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
