# Dumb Diagrams style guide

This is the shared visual contract for the website, documentation, and Studio.
The product should feel precise, approachable, and calm: navy gives it structure, orange draws attention, and generous space keeps content readable.

## Brand identity

The official wordmark is **dumbdiagrams.**: lowercase, no space, with an orange full stop. In prose, page titles, and accessible names, write **Dumb Diagrams**. The editor is **Dumb Diagrams Studio**, or Studio when the context is clear. Package names and CLI commands stay unchanged.

Use the supplied illustrated logo beside the wordmark where space allows. The transparent source is `packages/brand/assets/logo-dumb-diagrams-source.png`; public-directory PNGs are derivatives. Do not stretch derivatives, recolor provider icons, or replace them with UI-library icons. Leave half the wordmark's height clear around the lockup; decorative logo images use an empty `alt`.

The reusable wordmark and identity tokens live in `packages/brand/styles.css`, consumed as `@dumb-diagrams/brand/styles.css`. Set `--wordmark-size` to scale it; keep font, weights, tracking, and dot color in the brand package. If a parent already has an accessible name, hide the visual wordmark from assistive technology.

## Typography

| Use | Typeface | Treatment |
| --- | --- | --- |
| Official wordmark | Manrope Variable | `dumb` 800, `diagrams` 450, tracking `-.065em`, line height 1.15 |
| Website and Studio interface | Manrope Variable | `--font-brand`; usually 400–750 |
| Code and compact technical labels | IBM Plex Mono | `--font-code`, regular 400 |
| Website editorial emphasis | Georgia, system serif | Italic and limited to editorial emphasis |
| Diagram labels and annotations | Runtime diagram stack | Inter, Noto Sans, system sans-serif as available |

Manrope and IBM Plex Mono are self-hosted through Fontsource; there are no Google Fonts requests. Licenses live in `packages/brand/FONT-LICENSES.txt` and are copied into both built apps.

Keep interface typography and diagram typography separate. The runtime stack is not a promise that Inter is bundled: exported SVGs retain existing fallback behavior. Changing diagram typography changes measurement and geometry, so treat it as a renderer change with its own tests. Use readable sentence case; uppercase monospace belongs in short labels, not paragraphs.

## Color and themes

Shared identity values belong in the brand package. App styles alias them into
semantic roles; supporting tints may be derived from these core values.

| Token | Value | Use |
| --- | --- | --- |
| `--brand-navy` | `#163964` | Identity, headings, actions, and diagram UI ink |
| `--brand-navy-deep` | `#112d51` | Dark panels, shadows, and action hover |
| `--brand-coral` | `#f0531e` | Wordmark dot, emphasis, and indicators |
| `--brand-orange` | `#f7982c` | Secondary emphasis and highlights |
| `--brand-paper` | `#f7f6f2` | Website canvas |

Use derived `*-soft` and `*-deep` values from `styles.css`. For small orange links on paper, use a dark enough semantic orange for readable contrast. Orange punctuates a navy-and-paper composition; provider colors remain part of diagrams, not interface colors.

Studio keeps warm light and dark navy surfaces. Its semantic tokens live in `packages/editor/src/styles.css`. The wordmark becomes light under `data-theme="dark"` while retaining its orange dot. Check both themes and never force a navy wordmark onto a dark panel.

## Components and reuse

There is no shared React component library, shadcn/ui, Radix, or Tailwind layer. The brand package is CSS-only; sharing identity does not ship React to the static documentation site.

- Studio uses React, Vite, and authored CSS. Reuse panels, menus, docks, theme
  control, modal, error boundary, and custom SVG icons in `packages/editor/src/ui/`.
- The website uses static Astro and layered CSS. Reuse its shared header, footer,
  install, terminal, search, and base layout components.
- Documentation uses Astro content collections and Markdown with the shared docs
  layout, navigation, contents, code-copy control, and Pagefind.

Studio's compact floating panels, pills, and rounded controls serve editing. The
website uses sharper edges, fine rules, larger type, and more space for reading.
Keep those differences intentional; reuse existing radius and shadow tokens.

## Layout, interaction, and motion

Use an underlying 4px spacing rhythm with optical adjustments for typography. Website content has generous responsive gutters. Documentation uses a navigation/article/contents layout that collapses on small screens. Studio is a desktop editing surface; do not imply a mobile editor experience.

Prefer a border or quiet surface change to a heavy shadow. Keep visible keyboard focus, explicit button names, and native semantics. Interactive tabs need keyboard navigation; dialogs need focus management and an Escape path. Never communicate errors or selection through color alone.

Website motion uses the native Web Animations API and shared tokens in
`packages/website/src/styles/motion.css`; do not add an animation-library
dependency for a visual effect. The `trace-border` treatment is decorative,
animates opacity along an existing border, and must not intercept clicks. Avoid
looping typewriters, parallax, scroll hijacking, rotating glows, and continuous
animation.

Respect `prefers-reduced-motion`, including changes while the page is open.
Reduced motion removes decorative sweeps and preserves ordinary borders and focus
rings. Keep content visible before JavaScript and when motion is reduced or
JavaScript is unavailable; motion must not be required for reading.

## Writing and ownership

Start with what someone is trying to do, then show a small working example. Use
“you” and plain verbs; state limitations beside the feature they affect. Organize
public docs by the reader's task: start, make diagrams, understand implementation.

Keep developer commands and conventions in `CONTRIBUTING.md`, architectural
decisions in `docs/ARCHITECTURE.md`, release and infrastructure guidance in
`docs/RELEASE.md`, and focused runtime references with the owning package. Public
website explanations belong in `packages/website/src/content/docs/`.

When changing shared styles, run relevant website, typecheck, and Studio checks.
Font or workspace dependency changes also require the full build and package
smoke check because Studio and its source ship in the CLI.
