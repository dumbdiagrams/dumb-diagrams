import { useEffect, useMemo, useRef, useState } from "react";

import {
  listBrowsableAssets,
  listCategories,
  listProviders,
  searchAssets,
  type CatalogEntry,
  type CatalogProviderFilter,
  type UserCloudProvider,
} from "@dumb-diagrams/runtime/catalog";
import { DIAGRAM_LIMITS, type GroupKind } from "@dumb-diagrams/runtime/core";

import { CatalogAssetCard } from "./CatalogAssetCard";
import { ProviderMark } from "./ProviderMark";

const PROVIDER_LABELS: Record<"all" | UserCloudProvider, string> = {
  all: "All",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  "cloud-agnostic": "Cloud-agnostic",
};

const RECENT_KEY = "dumb-diagrams.recent-assets";
const FAVORITE_KEY = "dumb-diagrams.favorite-assets";
const ASSET_PAGE_SIZE = 80;

function readIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((value): value is string => typeof value === "string" && value.length <= DIAGRAM_LIMITS.idCharacters)
          .slice(0, 24)
      : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids.slice(0, 24)));
  } catch {
    // Storage restrictions should not break catalog interactions.
  }
}

function rememberRecent(type: string) {
  const next = [type, ...readIds(RECENT_KEY).filter((id) => id !== type)];
  writeIds(RECENT_KEY, next);
}

function toggleFavorite(type: string) {
  const current = readIds(FAVORITE_KEY);
  const next = current.includes(type) ? current.filter((id) => id !== type) : [type, ...current];
  writeIds(FAVORITE_KEY, next);
  return next;
}

function AssetGrid({
  entries,
  favorites,
  variant,
  onActivate,
  onToggleFavorite,
  onNearEnd,
}: {
  entries: CatalogEntry[];
  favorites: string[];
  variant: "service" | "group";
  onActivate: (entry: CatalogEntry) => void;
  onToggleFavorite: (type: string) => void;
  onNearEnd: () => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const end = endRef.current;
    if (!end) return;
    // Observe the end of the grid so pagination works whether the grid itself
    // scrolls or a short-window drawer scrolls the controls and results together.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onNearEnd();
      },
      { rootMargin: "280px" },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [entries.length, onNearEnd]);

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
      <div ref={endRef} className="asset-grid-end" aria-hidden="true" />
    </div>
  );
}

export function AssetBrowser({
  mode,
  onAddService,
  onAddGroup,
  onAddBoundary,
  onImportSvg,
}: {
  mode: "resources" | "groups";
  onAddService: (entry: CatalogEntry) => void;
  onAddGroup: (entry: CatalogEntry, kind: GroupKind) => void;
  onAddBoundary?: () => void;
  onImportSvg: (file: File) => void;
}) {
  const [provider, setProvider] = useState<CatalogProviderFilter>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "favorites" | "recent">("all");
  const [favorites, setFavorites] = useState<string[]>(() => readIds(FAVORITE_KEY));
  const [recents, setRecents] = useState<string[]>(() => readIds(RECENT_KEY));
  const [importingSvg, setImportingSvg] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ASSET_PAGE_SIZE);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const categoryTypeahead = useRef("");
  const categoryTypeaheadTimer = useRef<number | undefined>(undefined);

  const categories = useMemo(() => listCategories(provider, mode), [provider, mode]);
  const allEntries = useMemo(
    () =>
      listBrowsableAssets(provider, mode).filter(
        (entry) => mode !== "groups" || entry.type !== "cloud-agnostic.boundary",
      ),
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
          mode === "groups"
            ? entry.assetKind === "group" && entry.type !== "cloud-agnostic.boundary"
            : entry.assetKind === "resource",
        )
        .sort((a, b) => a.serviceName.localeCompare(b.serviceName));
    } else {
      entries =
        mode === "groups" || !category ? allEntries : allEntries.filter((entry) => entry.categories.includes(category));
    }
    if (filter === "favorites") entries = entries.filter((entry) => favorites.includes(entry.type));
    if (filter === "recent") entries = entries.filter((entry) => recents.includes(entry.type));
    return entries;
  }, [allEntries, category, filter, favorites, mode, provider, query, recents]);
  const visibleEntries = filteredEntries.slice(0, visibleCount);
  const hasMore = visibleCount < filteredEntries.length;

  useEffect(() => {
    setVisibleCount(ASSET_PAGE_SIZE);
  }, [category, filter, mode, provider, query]);

  useEffect(() => {
    if (!categoryOpen) return;
    const close = (event: PointerEvent) => {
      if (!categoryRef.current?.contains(event.target as Node)) setCategoryOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [categoryOpen]);

  useEffect(
    () => () => {
      if (categoryTypeaheadTimer.current !== undefined) {
        window.clearTimeout(categoryTypeaheadTimer.current);
      }
    },
    [],
  );

  const selectCategoryByTyping = (key: string) => {
    if (key.length !== 1 || !/[\p{L}\p{N}]/u.test(key)) return false;
    if (categoryTypeaheadTimer.current !== undefined) {
      window.clearTimeout(categoryTypeaheadTimer.current);
    }
    categoryTypeahead.current += key.toLocaleLowerCase();
    categoryTypeaheadTimer.current = window.setTimeout(() => {
      categoryTypeahead.current = "";
    }, 700);
    const typed = categoryTypeahead.current;
    const match =
      categories.find((item) => item.toLocaleLowerCase().startsWith(typed)) ??
      categories.find((item) => item.toLocaleLowerCase().startsWith(key.toLocaleLowerCase()));
    if (match) setCategory(match);
    return true;
  };

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
      <div className={`asset-browser-toolbar${mode === "groups" ? " groups-toolbar" : ""}`}>
        {mode === "groups" && onAddBoundary && (
          <button
            type="button"
            className="secondary-button add-boundary-button"
            onClick={onAddBoundary}
            title="Add a movable boundary"
          >
            <span className="add-boundary-button__mark" aria-hidden="true" />
            <span className="add-boundary-button__label">Add boundary</span>
          </button>
        )}
        <input
          className="drawer-search-input"
          value={query}
          maxLength={DIAGRAM_LIMITS.searchCharacters}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder={mode === "groups" ? "Search boundaries across providers" : "Search services across providers"}
          aria-label="Search catalog"
        />
        {mode === "resources" && (
          <>
            <button
              type="button"
              className="secondary-button"
              disabled={importingSvg}
              onClick={() => fileRef.current?.click()}
            >
              {importingSvg ? "Importing…" : "Import SVG"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (!file) return;
                setImportingSvg(true);
                try {
                  await onImportSvg(file);
                } finally {
                  setImportingSvg(false);
                }
              }}
            />
          </>
        )}
      </div>

      <div className="asset-browser-controls">
        <div className="provider-tabs" role="tablist">
          {["all" as const, ...listProviders()].map((item) => (
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
              <ProviderMark provider={item} />
              <span>{item === "cloud-agnostic" ? "Cloud" : PROVIDER_LABELS[item]}</span>
            </button>
          ))}
        </div>

        {mode === "resources" && categories.length > 0 && (
          <div className="category-picker" ref={categoryRef}>
            <button
              type="button"
              className="category-picker__trigger"
              aria-haspopup="listbox"
              aria-expanded={categoryOpen}
              onClick={() => setCategoryOpen((open) => !open)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setCategoryOpen(true);
                  return;
                }
                if (event.key === "Escape") {
                  setCategoryOpen(false);
                  return;
                }
                if (selectCategoryByTyping(event.key)) event.preventDefault();
              }}
            >
              <span>
                {category || (mode === "resources" ? "All categories" : categories[0])}
                <small>
                  {category
                    ? allEntries.filter((entry) => entry.categories.includes(category)).length
                    : allEntries.length}
                </small>
              </span>
              <span className="category-picker__chevron" aria-hidden="true" />
            </button>
            {categoryOpen && (
              <div className="category-picker__menu" role="listbox" aria-label="Category">
                {mode === "resources" && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={!category}
                    className={!category ? "is-selected" : ""}
                    onClick={() => {
                      setCategory("");
                      setCategoryOpen(false);
                    }}
                  >
                    <span>All categories</span>
                    <small>{allEntries.length}</small>
                  </button>
                )}
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="option"
                    aria-selected={category === item}
                    className={category === item ? "is-selected" : ""}
                    onClick={() => {
                      setCategory(item);
                      setCategoryOpen(false);
                    }}
                  >
                    <span>{item}</span>
                    <small>{allEntries.filter((entry) => entry.categories.includes(item)).length}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {mode === "groups" && <p className="asset-browser-count">{allEntries.length + 1} boundaries available</p>}
        {(favorites.length > 0 || recents.length > 0) && (
          <div className="asset-filters" role="group" aria-label="Catalog filters">
            <button type="button" className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>
              All
            </button>
            {favorites.length > 0 && (
              <button
                type="button"
                className={filter === "favorites" ? "is-active" : ""}
                onClick={() => setFilter("favorites")}
              >
                Favorites
              </button>
            )}
            {recents.length > 0 && (
              <button
                type="button"
                className={filter === "recent" ? "is-active" : ""}
                onClick={() => setFilter("recent")}
              >
                Recent
              </button>
            )}
          </div>
        )}
      </div>

      <div className="asset-browser-body">
        <AssetGrid
          entries={visibleEntries}
          favorites={favorites}
          variant={mode === "groups" ? "group" : "service"}
          onActivate={activate}
          onToggleFavorite={(type) => setFavorites(toggleFavorite(type))}
          onNearEnd={() => {
            setVisibleCount((current) =>
              current === visibleCount ? Math.min(current + ASSET_PAGE_SIZE, filteredEntries.length) : current,
            );
          }}
        />
        {filteredEntries.length > ASSET_PAGE_SIZE && (
          <div
            className="asset-browser-more"
            aria-live="polite"
            aria-label={hasMore ? "Loading more catalog items" : "All catalog items loaded"}
          >
            <span>
              {hasMore
                ? `Showing ${visibleEntries.length} of ${filteredEntries.length} · scroll for more`
                : `All ${filteredEntries.length} items loaded`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
