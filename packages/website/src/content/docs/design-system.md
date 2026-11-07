---
title: Brand and interface
description: The official Dumb Diagrams wordmark, colors, typography, and shared interface rules.
section: Reference
order: 31
---
The website and Studio share one visual identity: navy gives the interface structure,
orange marks emphasis, and paper surfaces keep diagrams and text easy to read.

## Official wordmark

<div class="brand-specimen" aria-label="Official Dumb Diagrams wordmark"><span class="dd-wordmark" aria-hidden="true">dumb<span class="dd-wordmark__light">diagrams</span><span class="dd-wordmark__dot">.</span></span><span class="mono">THE OFFICIAL WORDMARK</span></div>

The official logo lockup is **dumbdiagrams.**: lowercase, with no space and an
orange full stop. Keep this spelling, casing, spacing, and color when editing
the header, footer, or Studio. Use **Dumb Diagrams** in prose, page titles, and
accessible names; use **Studio** for the editor when the context is clear.

The wordmark uses Manrope Variable, weight 800 for “dumb” and 450 for “diagrams”,
with letter spacing of −0.065em. The illustrated logo may sit beside it. The
shared wordmark classes and size token come from `packages/brand/styles.css`;
scale it with `--wordmark-size` rather than redefining its typography.

## Colors

<div class="brand-swatches"><div class="swatch swatch-navy"><strong>Primary navy</strong><code>#163964</code></div><div class="swatch swatch-deep"><strong>Deep navy</strong><code>#112d51</code></div><div class="swatch swatch-orange-dark"><strong>Coral</strong><code>#f0531e</code></div><div class="swatch swatch-orange-light"><strong>Orange</strong><code>#f7982c</code></div></div>

| Token | Value | Use |
| --- | --- | --- |
| `--brand-navy` | `#163964` | Wordmark, headings, actions, and interface ink |
| `--brand-navy-deep` | `#112d51` | Dark panels and depth |
| `--brand-coral` | `#f0531e` | Wordmark period, links, and selected states |
| `--brand-orange` | `#f7982c` | Highlights, indicators, and bright accents |
| `--brand-paper` | `#f7f6f2` | Website canvas |

Use the shared derived `*-soft` and `*-deep` tokens where appropriate. Keep
orange as an accent in a navy-and-paper palette. Provider icons retain their
own colors; do not recolor them to match the interface.

## Typography and themes

| Use | Typeface and treatment |
| --- | --- |
| Wordmark, website, and Studio interface | Manrope Variable |
| Code, commands, and compact technical labels | IBM Plex Mono |
| Editorial italic emphasis | Georgia, used sparingly |
| Diagram labels and annotations | The existing Inter / Noto Sans / system sans-serif stack |

Manrope and IBM Plex Mono are bundled locally; the website and Studio do not
request them from Google Fonts. Keep diagram typography separate from interface
typography because changing it can affect text measurement and exported geometry.

Studio supports warm light surfaces and a dark navy theme. On dark surfaces,
the wordmark turns light while its orange period stays. Check both themes when
changing shared identity styles.

## Keep the identity consistent

The repository guide at `docs/STYLE_GUIDE.md` and the shared tokens in
`packages/brand/styles.css` are the implementation references. Update shared
identity there instead of adding competing logo treatments or duplicate color
values to an individual app. Keep visible keyboard focus, readable contrast,
and reduced-motion support when changing interface styles.
