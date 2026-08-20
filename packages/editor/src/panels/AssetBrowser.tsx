import { useEffect, useMemo, useRef, useState } from "react";

import {
  listBrowsableAssets,
  listCategories,
  listProviders,
  searchAssets,
  type CatalogEntry,
  type CatalogProviderFilter,
  type UserCloudProvider,
} from "@dumb-diagrams/catalog";
import type { GroupKind } from "@dumb-diagrams/core";

import { CatalogAssetCard } from "./CatalogAssetCard";

const PROVIDER_LABELS: Record<"all" | UserCloudProvider, string> = {
  all: "All",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  "cloud-agnostic": "Cloud-agnostic",
};

const RECENT_KEY = "dumb-diagrams.recent-assets";
const FAVORITE_KEY = "dumb-diagrams.favorite-assets";

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  localStorage.setItem(key, JSON.stringify(ids.slice(0, 24)));
}

function rememberRecent(type: string) {
  const next = [type, ...readIds(RECENT_KEY).filter((id) => id !== type)];
  writeIds(RECENT_KEY, next);
}

function toggleFavorite(type: string) {
  const current = readIds(FAVORITE_KEY);
  const next = current.includes(type)
    ? current.filter((id) => id !== type)
    : [type, ...current];
  writeIds(FAVORITE_KEY, next);
  return next;
}

function AssetGrid({
  entries,
  favorites,
  variant,
  onActivate,
  onToggleFavorite,
}: {
  entries: CatalogEntry[];
  favorites: string[];
  variant: "service" | "group";
  onActivate: (entry: CatalogEntry) => void;
  onToggleFavorite: (type: string) => void;
}) {
  if (!entries.length) {
    return <div className="palette-empty">No matching assets for this view.</div>;
  }

  return (
    <div className={`palette-grid asset-grid${variant === "group" ? " is-group-grid" : ""}`}>
      {entries.map((entry) => (
        <CatalogAssetCard
          key={entry.type}
          entry={entry}
          providerLabel={PROVIDER_LABELS[entry.provider]}
          isFavorite={favorites.includes(entry.type)}
          variant={variant}
          onActivate={() => onActivate(entry)}
          onToggleFavorite={() => onToggleFavorite(entry.type)}
        />
      ))}
    </div>
  );
}

export function AssetBrowser({
  mode,
  onAddService,
  onAddGroup,
  onImportSvg,
}: {
  mode: "resources" | "groups";
  onAddService: (entry: CatalogEntry) => void;
  onAddGroup: (entry: CatalogEntry, kind: GroupKind) => void;
  onImportSvg: (file: File) => void;
}) {
  const [provider, setProvider] = useState<CatalogProviderFilter>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "favorites" | "recent">("all");
  const [favorites, setFavorites] = useState<string[]>(() => readIds(FAVORITE_KEY));
  const [recents, setRecents] = useState<string[]>(() => readIds(RECENT_KEY));
  const fileRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(
    () => listCategories(provider, mode),
    [provider, mode],
  );
  const allEntries = useMemo(
    () => listBrowsableAssets(provider, mode),
    [provider, mode],
  );

  useEffect(() => {
    if (category && !categories.includes(category)) setCategory("");
    setFilter("all");
  }, [provider, mode, categories, category]);

  const filteredEntries = useMemo(() => {
    let entries: CatalogEntry[];
    if (query.trim()) {
        entries = searchAssets(query, provider)
        .filter((entry) =>
          mode === "groups" ? entry.assetKind === "group" : entry.assetKind === "resource",
        )
        .sort((a, b) => a.serviceName.localeCompare(b.serviceName));
    } else {
      entries = mode === "groups" || !category
        ? allEntries
        : allEntries.filter((entry) => entry.categories.includes(category));
    }
    if (filter === "favorites") entries = entries.filter((entry) => favorites.includes(entry.type));
    if (filter === "recent") entries = entries.filter((entry) => recents.includes(entry.type));
    return entries;
  }, [allEntries, category, filter, favorites, mode, provider, query, recents]);

  const activate = (entry: CatalogEntry) => {
    const next = [entry.type, ...recents.filter((id) => id !== entry.type)];
    setRecents(next);
    rememberRecent(entry.type);
    if (mode === "groups") {
      onAddGroup(entry, (entry.groupKind as GroupKind) ?? "logical");
    } else {
      onAddService(entry);
    }
  };

  return (
    <div className="asset-browser">
      <div className="asset-browser-toolbar">
        <input
          className="drawer-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            mode === "groups"
              ? "Search groups across providers"
              : "Search services across providers"
          }
          aria-label="Search catalog"
        />
        {mode === "resources" && (
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={() => fileRef.current?.click()}
            >
              Import SVG
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImportSvg(file);
              }}
            />
          </>
        )}
      </div>

      <div className="asset-browser-controls">
        <div className="provider-tabs" role="tablist">
          {(["all", ...listProviders()] as CatalogProviderFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={provider === item}
              className={provider === item ? "is-active" : ""}
              onClick={() => {
                setProvider(item);
                setCategory("");
              }}
            >
              {PROVIDER_LABELS[item]}
            </button>
          ))}
        </div>

        {categories.length > 0 && (
          <label className="category-select">
            <span className="sr-only">Category</span>
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
              }}
            >
              {mode === "resources" && <option value="">All categories</option>}
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item} (
                  {allEntries.filter((entry) => entry.categories.includes(item)).length})
                </option>
              ))}
            </select>
          </label>
        )}

        {mode === "groups" && (
          <p className="asset-browser-count">
            {allEntries.length} group{allEntries.length === 1 ? "" : "s"} available
          </p>
        )}
        {(favorites.length > 0 || recents.length > 0) && (
          <div className="asset-filters" role="group" aria-label="Catalog filters">
            <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All</button>
            {favorites.length > 0 && <button type="button" className={filter === "favorites" ? "is-active" : ""} onClick={() => setFilter("favorites")}>Favorites</button>}
            {recents.length > 0 && <button type="button" className={filter === "recent" ? "is-active" : ""} onClick={() => setFilter("recent")}>Recent</button>}
          </div>
        )}
      </div>

      <div className="asset-browser-body">
        <AssetGrid
          entries={filteredEntries}
          favorites={favorites}
          variant={mode === "groups" ? "group" : "service"}
          onActivate={activate}
          onToggleFavorite={(type) => setFavorites(toggleFavorite(type))}
        />
      </div>
    </div>
  );
}
