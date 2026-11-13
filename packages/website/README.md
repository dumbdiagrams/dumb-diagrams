# Dumb Diagrams website

A static Astro site with the public documentation. It has no server adapter,
no client framework, and no external font requests. Pagefind builds a local
search index.

## Work locally

```bash
pnpm dev:website       # website at http://127.0.0.1:4321; local Studio at http://127.0.0.1:49323
pnpm check:website     # diagnostics, production build, and site tests
pnpm preview:website   # production preview at http://127.0.0.1:4321, with local Studio; search only works here
```

The local website's Studio link targets the loopback hosted build so browser
storage and the Studio security policy can be tested independently. Production
builds keep the link pointed at `https://studio.dumbdiagrams.com`.

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

## Hosted Studio deployment

Hosted Studio is deployed as a separate static Cloudflare Pages project so its
browser storage and security policy are isolated from the documentation site.
Create a second Pages project from this repository, use `main` as the
production branch, choose the **None** framework preset, and set the repository
root as the build root. Use `pnpm build:studio:hosted` as the build command and
`packages/editor/dist-hosted` as the output directory. The website build also
builds the hosted Studio, so `pnpm build:website` produces both outputs while
keeping them separate for deployment to their respective hostnames. Match the repository's
pinned Node and pnpm versions (`.nvmrc` and `package.json`), and do not add the
website analytics environment variables to this project.

In the Pages project, open **Custom domains** and add
`studio.dumbdiagrams.com`. If Cloudflare manages the `dumbdiagrams.com` zone,
it can create the DNS record; otherwise add the CNAME target Cloudflare gives
you at your DNS provider after registering the custom domain in Pages. Verify
the HTTPS certificate, response security headers, and hosted Studio smoke
checks before publishing the Studio link. Merges to `main` then deploy the
website and hosted Studio independently; no npm release or version bump is
required.

### Shared Studio regression tests

The local and hosted Studio use the same editor implementation. `pnpm test:e2e`
runs the editor specs in `e2e/` against the local build; `pnpm test:e2e:hosted`
runs those exact same specs against the hosted production build with its security
headers. New editor specs are automatically included in both runs. Shared execution
settings live in `playwright.shared.ts`.

The hosted regression project dismisses onboarding through browser preferences.
A separate `hosted-shell` project runs `e2e-hosted/` with fresh preferences to
check onboarding, privacy, and hosted settings. Both projects run in the required
hosted CI job and in `pnpm ci:e2e`. This checks the build intended for deployment;
it does not inspect the live production hostname.

## Analytics

Analytics is off unless `PUBLIC_GA_MEASUREMENT_ID` (`G-…`) is set at build
time. That also requires `PUBLIC_SITE_OPERATOR`, `PUBLIC_PRIVACY_EMAIL`, and
`PUBLIC_ANALYTICS_RETENTION_MONTHS` (`2` or `14`), or the build fails.

GA4 runs through Partytown only after explicit consent, and nothing is sent to
Google before that. The footer and `/privacy/` let visitors revoke consent.
Review `src/pages/privacy.astro` for your operator and legal details before
launch; the environment variables alone do not make the notice compliant.
