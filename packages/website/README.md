# Dumb Diagrams website

A static Astro site with the public documentation. It has no server adapter,
no client framework, and no external font requests. Pagefind builds a local
search index.

## Work locally

```bash
pnpm dev:website       # http://localhost:4321
pnpm check:website     # diagnostics, production build, and site tests
pnpm preview:website   # production preview; search only works here
```

Asset preparation builds the runtime and CLI, renders `src/examples/*.dgm`
and the curated examples, and captures a real `dumbdiagrams init` log for the
homepage terminal.

## Content

- `src/content/docs/*.md(x)`: articles. Each needs `title`, `description`,
  `section`, and `order` frontmatter. Sidebar, search, and `llms.txt` follow
  the collection.
- `src/content/docs/source-format.md` is the authoritative syntax reference.
  A test fails if a parser keyword is missing from it.
- Complete `dgm` code fences are compiled by the tests. Use `text` for partial
  snippets.
- Use relative links between articles so subdirectory deployments work.
- `src/pages/index.astro` is the homepage, and `src/styles/` holds the
  styles. Visual rules are in [STYLE_GUIDE.md](../../docs/STYLE_GUIDE.md).

## Build and host

```bash
SITE_URL=https://example.com pnpm build:website
SITE_URL=https://example.com BASE_PATH=/diagrams/ pnpm build:website
```

Upload `packages/website/dist/` to any static host, and serve `404.html` for
missing pages. Canonical URLs and the sitemap need `SITE_URL`. Set
`PUBLIC_REPOSITORY_URL` to show source links. On Cloudflare Pages, build from
the repository root: the build command is `pnpm build:website`, the output is
`packages/website/dist`, and `NODE_VERSION` and `PNPM_VERSION` must match the
pinned toolchain.

## Analytics

Analytics is off unless `PUBLIC_GA_MEASUREMENT_ID` (`G-…`) is set at build
time. That also requires `PUBLIC_SITE_OPERATOR`, `PUBLIC_PRIVACY_EMAIL`, and
`PUBLIC_ANALYTICS_RETENTION_MONTHS` (`2` or `14`), or the build fails.

GA4 runs through Partytown only after explicit consent, and nothing is sent to
Google before that. The footer and `/privacy/` let visitors revoke consent.
Review `src/pages/privacy.astro` for your operator and legal details before
launch; the environment variables alone do not make the notice compliant.
