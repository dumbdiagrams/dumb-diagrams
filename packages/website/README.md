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

The check runs Astro diagnostics, a production build, and tests for local links/anchors/assets, valid diagram examples, portable downloads, metadata, analytics consent, worker assets, and a small initial payload. Search needs the production index; test it in preview, not the dev server. Astro 7 preview runs in the background; use `pnpm --filter @dumb-diagrams/website exec astro preview stop` to stop it.

## Edit content and design

- `src/pages/index.astro`: marketing page.
- `src/content/docs/*.md`: public documentation, in natural language.
- `src/pages/docs/[...slug].astro`: shared docs layout and navigation.
- `src/styles/`: shared styles, marketing layout, and reading layout.
- `src/components/`: navigation, installation command, footer, search.
- `src/examples/`: actual diagram sources, compiled before dev/build.
- `src/lib/site.ts`: base-aware links and shared commands.

Every article has `title`, `description`, `section`, and `order` frontmatter. Sidebar, pagination, search, and `llms.txt` follow the collection. Use relative links between articles so subdirectory deployments work. Complete `dgm` code fences are compiled in tests; use `text` for intentionally partial syntax examples.

The articles are based on `docs/TECHNICAL_OVERVIEW.md`, the application README,
and focused runtime contracts. Keep those references and the public
explanations aligned when behavior changes. The public workflow is always
`dumbdiagrams init` followed by `dumbdiagrams studio`; `.dgm` files are
portable and Studio is independent of the launch repository.

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

### Cloudflare Pages (when you are ready to deploy)

Use the repository root as the build root, **not** `packages/website`: asset preparation needs the other workspace packages. Set the build command to `pnpm build:website` and the output directory to `packages/website/dist`. This is static output; no Cloudflare adapter or server function is needed.

In Pages build variables, set `NODE_VERSION=24.15.0`, `PNPM_VERSION=11.23.0` (matching the repository's pinned toolchain), and `SITE_URL` to the real HTTPS origin. Leave `BASE_PATH` unset for a root-domain deployment. Cloudflare supports these [build-tool version overrides](https://developers.cloudflare.com/pages/configuration/build-image/). Add the analytics/privacy variables below to **production only**; omit the GA ID on preview deployments so test traffic does not enter your production property. These instructions do not create or deploy a Pages project.

## Google Analytics 4 through Partytown

Set your actual GA4 **measurement ID** (`G-…`, not a `GTM-…` container ID) in the build environment. The ID is public, not a secret. Setting it enables the official [Astro Partytown integration](https://docs.astro.build/en/guides/integrations-guide/partytown/) automatically:

```bash
SITE_URL=https://your-domain.example \
PUBLIC_GA_MEASUREMENT_ID=G-YOURMEASUREMENTID \
PUBLIC_SITE_OPERATOR='Your legal name or company' \
PUBLIC_PRIVACY_EMAIL=privacy@your-domain.example \
PUBLIC_ANALYTICS_RETENTION_MONTHS=2 \
pnpm check:website
pnpm preview:website
```

Use shell/hosting build variables for this configuration; Astro config does not load `.env` files here. Without an ID, no analytics UI or Partytown bootstrap is rendered. `ENABLE_PARTYTOWN=true` remains available for integration-only testing. Development pages never render the GA4 component; use a production preview to test it.

The first-layer consent panel is deliberately concise. **Reject**, **Necessary only**, and **Accept all** are visible one-click choices, with **Accept all** as the primary action; the full details are linked. No Google script, request, or cookieless ping is made before an explicit opt-in. The choice is honored for 180 days; advertising storage, ad personalization, and Google signals stay disabled. The local Partytown worker can initialize before consent, but the Google tag runs in it only after consent. [Partytown’s GA4 setup](https://partytown.qwik.dev/google-tag-manager/) uses `text/partytown` and forwards `dataLayer.push`; no analytics proxy is needed.

Every footer has a visually distinct **Cookie preferences** control, the current consent status, and a **Revoke analytics consent** button whenever analytics is allowed. These controls reopen the same panel; revocation is one click. The privacy page offers the same controls. Withdrawal deletes this integration’s host-only `_ga` cookies and reloads to unload the tracker; it does not erase data already sent to Google. GA cookies expire after 180 days without extending expiry on activity. Blocked storage fails closed on the next visit. Back/forward restoration is preserved unless consent changed while the page was away. Tracking applies only to this website, never the diagram runtime or Studio.

In `astro dev`, the panel is always available as a clearly labelled local preview—even without a measurement ID—so its layout and choices can be reviewed without sending anything to Google. Production builds still omit the panel when analytics is not configured, because asking for consent to processing that does not occur would be misleading.

`/privacy/` is a pre-launch draft until the operator, contact email, and retention are configured; an incomplete draft is excluded from the sitemap and marked `noindex`. A build with a GA ID **fails** if those details are missing. `PUBLIC_ANALYTICS_RETENTION_MONTHS` accepts `2` or `14` for standard GA4. It only updates the notice: separately choose the same retention in Google Analytics Admin and review its reset-on-new-activity setting. [Google explains the retention controls and aggregate-report exceptions](https://support.google.com/analytics/answer/7667196?hl=en).

Before launch, review `src/pages/privacy.astro` for your actual operator, hosting/access-log purposes and retention, legal basis, provider arrangements, international transfers, and rights/contact process. The proposed host is Cloudflare Pages; the hosting paragraph is deliberately identified as pre-launch. Do not treat completed environment variables as legal approval of the notice.

Before production activation, review the consent copy and your privacy disclosures, then verify with your actual property:

1. Fresh visit: no requests to Google before accepting; declining survives navigation.
2. Accept: `~partytown/partytown-sw.js` and the worker load successfully; `gtag/js` runs through Partytown; the GA4 `g/collect` request succeeds. Check the page view in GA4 Realtime (or enable DebugView for a test session).
3. Use the footer's revoke button: the page reloads, GA cookies are removed, and future pages send no analytics. Reopen settings and check that accepting again works.
4. Repeat on the real host and any `BASE_PATH`; serve worker files as JavaScript over HTTPS (localhost also works). Review the host’s CSP if present. Worker/ad-blocker behavior can differ from local testing.

Partytown and this consent UI are implementation details, not a guarantee of regulatory compliance. Google’s [consent documentation](https://developers.google.com/tag-platform/security/guides/consent) describes the available consent signals.

## SEO and performance verification

The homepage positions the product as **LLM-first architecture diagrams as code**. The page title, description, visible copy, agent guide, and `llms.txt` use the same language. SoftwareApplication structured data describes the actual product; docs have matching visible breadcrumbs and BreadcrumbList data. Canonicals, robots sitemap links, and the sitemap require `SITE_URL`; no production domain is invented. `llms.txt` is a convenience for agents, not a search-ranking guarantee.

Audit the **production preview**, not `astro dev`: the dev server sends unminified modules and a live-reload WebSocket, which can cause minification and back/forward-cache diagnostics. Production output is minified by Astro/Vite. The primary font is preloaded, the logo is generated at responsive sizes, the hero is visible without an entrance animation, and border accents animate opacity instead of background position.

```bash
pnpm check:website
pnpm preview:website
# Use the URL printed by preview (the port may differ if one is occupied).
pnpm dlx lighthouse http://localhost:4321/ --preset=desktop --view
pnpm dlx lighthouse http://localhost:4321/ --view
```

Test both desktop and mobile, plus a returning visitor who has allowed analytics. Lighthouse is a lab result: network, CPU, consent state, and hosting affect it. Repeat on the deployed domain before treating a local 100 as a production result. Keep compression enabled on the host and cache hashed `/_astro/` files long-term; allow HTML and Partytown files to revalidate on deployments.

## Dependency policy

Dependencies are pinned in this package and locked in the workspace. Astro 7.2.6 was the newest stable version satisfying the repository’s 24-hour minimum release age when this site was added. Keep that safety window intact during upgrades.

Fonts are self-hosted through Fontsource. Diagrams use the project’s existing renderer and reviewed provider assets. No illustration generation, remote icon CDN, or client-side diagram compiler is needed.

## Visual identity and motion

See [the shared style guide](../../docs/STYLE_GUIDE.md). Both Studio and the website import the CSS-only `@dumb-diagrams/brand` package. The site uses the native Web Animations API for one-time section entrances and a small frame-based playback controller for the terminal, without an animation-library download. Reduced-motion preferences show a static transcript; no animation is required to read content.

`prepare:assets` compiles the runtime and CLI, then `scripts/capture-cli.mjs` runs `dumbdiagrams init` in a temporary directory. It captures the actual initialization log with ANSI colors, normalizes the example home path, and removes the temporary repository. No npm package is fetched, no Studio server is started, and no commands run in the visitor's browser. `src/lib/ansi.mjs` escapes text before rendering the CLI styles.

The homepage imports three selected examples from the canonical curated bundles under `examples/curated/`. Each bundle contains the natural prompt, architecture brief, preserved reference specification, and portable `.dgm`; asset preparation renders the same diagram source used by Studio. Keep those sources intact: the website is a view of the app examples, not a separate set of lookalikes. Output controls enlarge the SVG without changing its geometry.
