# Dumb Diagrams website

The public website and documentation live here, independently of Studio. This is a static Astro 7 site: no server adapter, React runtime, hosted CMS, or external font requests. Markdown is checked with content collections. Pagefind builds a local search index and loads it only when a reader searches.

## Work locally

From the repository root, using Node.js 24+ and the pinned pnpm:

```bash
pnpm install --frozen-lockfile
pnpm dev:website
```

The dev server prints the local URL (port 4321 by default). The asset preparation step builds the runtime and renders the homepage examples from `src/examples/*.dgm`. Branding and legal notices are copied from the application, not maintained as competing originals.

```bash
pnpm check:website
pnpm preview:website
```

The check runs Astro diagnostics, a production build, and tests for local links/anchors/assets, valid diagram examples, portable downloads, and a small initial payload. Search needs the production index; test it in preview, not the dev server. Astro 7 preview runs in the background; use `pnpm --filter @dumb-diagrams/website exec astro preview stop` to stop it.

## Edit content and design

- `src/pages/index.astro`: marketing page.
- `src/content/docs/*.md`: public documentation, in natural language.
- `src/pages/docs/[...slug].astro`: shared docs layout and navigation.
- `src/styles/`: shared styles, marketing layout, and reading layout.
- `src/components/`: navigation, installation command, footer, search.
- `src/examples/`: actual diagram sources, compiled before dev/build.
- `src/lib/site.ts`: base-aware links and shared commands.

Every article has `title`, `description`, `section`, and `order` frontmatter. Sidebar, pagination, search, and `llms.txt` follow the collection. Use relative links between articles so subdirectory deployments work. Complete `dgm` code fences are compiled in tests; use `text` for intentionally partial syntax examples.

The articles are based on `docs/TECHNICAL_OVERVIEW.md`, the application README, project templates, and focused runtime contracts. Keep those references and the public explanations aligned when behavior changes.

## Build and host

```bash
SITE_URL=https://your-domain.example pnpm build:website
```

Upload `packages/website/dist/` to any static host. Use its normal directory-index routing and serve `404.html` for missing pages. There are no server functions. Leave the existing Studio deployment unchanged; this package does not automatically take over its GitHub Pages destination.

For a subdirectory deployment:

```bash
SITE_URL=https://your-domain.example BASE_PATH=/diagrams/ pnpm build:website
BASE_PATH=/diagrams/ pnpm --filter @dumb-diagrams/website test
```

`SITE_URL` is the origin, `BASE_PATH` is the pathname. Set them as build environment variables. Canonical URLs and the sitemap are emitted only when the actual site origin is supplied. The repository has no configured Git remote, so source links are optional: set `PUBLIC_REPOSITORY_URL` to a verified repository URL when available. Until then, navigation links to the npm package instead of an invented GitHub URL.

## Partytown and future analytics

The official [Astro Partytown integration](https://docs.astro.build/en/guides/integrations-guide/partytown/) is installed but disabled by default. No Google tag, measurement ID, cookies, or analytics requests are shipped.

When analytics are ready:

1. Decide the consent and privacy behavior before loading the tracker.
2. Enable `ENABLE_PARTYTOWN=true` in the build environment.
3. Add the approved scripts with `type="text/partytown"`; the integration already forwards `dataLayer.push` and respects the configured base path.
4. Verify consent, worker loading, CSP, and measurement on the actual host. Partytown changes where scripts execute; it does not supply consent management.

Keep tracking code out of the diagram runtime and Studio packages. Use the integration’s official documentation for the provider’s required worker/proxy behavior rather than adding an untested tag snippet.

## Dependency policy

Dependencies are pinned in this package and locked in the workspace. Astro 7.2.6 was the newest stable version satisfying the repository’s 24-hour minimum release age when this site was added. Keep that safety window intact during upgrades.

Fonts are self-hosted through Fontsource. Diagrams use the project’s existing renderer and reviewed provider assets. No illustration generation, remote icon CDN, or client-side diagram compiler is needed.
