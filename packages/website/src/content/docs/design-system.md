---
title: Brand and interface
description: The typography, colors, and components shared by the website and Studio.
section: Reference
order: 31
---
The visual system uses four brand colors and restrained typography. The website
uses open spacing; Studio keeps its controls compact so the diagram remains
central. The two surfaces share the same brand while serving different
purposes.

## One name, one wordmark

<div class="brand-specimen" aria-label="Official Dumb Diagrams wordmark"><span class="dd-wordmark" aria-hidden="true">dumb<span class="dd-wordmark__light">diagrams</span><span class="dd-wordmark__dot">.</span></span><span class="mono">THE OFFICIAL WORDMARK</span></div>

The wordmark is **dumbdiagrams.** All lowercase, no space, with an orange period.
Use **Dumb Diagrams** in prose and **Studio** for the editor. Package and command
names remain lowercase and hyphenated.

The lettering is **Manrope Variable**: weight 800 for “dumb”, 450 for “diagrams”,
with letter spacing of −0.065em. The existing illustrated logo can sit beside
it. Both the site and Studio import this treatment from the same brand package.

## Navy first, orange for emphasis

<div class="brand-swatches"><div class="swatch swatch-navy"><strong>Primary navy</strong><code>#163964</code></div><div class="swatch swatch-deep"><strong>Navy shadow blue</strong><code>#112d51</code></div><div class="swatch swatch-orange-dark"><strong>Dark orange</strong><code>#f0531e</code></div><div class="swatch swatch-orange-light"><strong>Light orange</strong><code>#f7982c</code></div></div>

Primary navy comes from the logo and carries headings, primary actions, and
dark sections. Navy shadow blue supports depth and contrast in dark surfaces.
Dark orange marks readable emphasis such as links and selected states. Light
orange is the brighter accent for logo details, dots, arrows, and focus
indicators. Neutral paper and ink colors support reading but are not brand
colors.

Studio has light and dark themes. The wordmark becomes light on dark surfaces,
but its orange period stays. Cloud-provider icons keep their own colors.

## Typography

| Where | What we use |
| --- | --- |
| Wordmark, interface, and website text | Manrope Variable |
| Source code, commands, and technical labels | IBM Plex Mono |
| A few italic editorial lines on the website | Georgia, from your system |
| Diagram labels and annotations | The existing Inter / Noto Sans / system-sans stack |

Manrope and IBM Plex Mono are bundled locally. Opening the website or Studio
does not request them from Google Fonts. Diagram typography stays separate:
changing it can affect text measurement and exported geometry, not only control
styling.

## The components behind the interface

Studio uses **React 19 and custom components**. **CodeMirror 6 is the embedded
code editor**, not a UI component library: it powers the `.dgm` source drawer,
including line numbers, bracket matching, selection, and editing shortcuts.
The menus, modals, floating panels, tool dock, theme control, and SVG
icons live in `packages/editor/src/ui/`. We do not use shadcn/ui, Radix, or
Tailwind.

The website uses **Astro and plain CSS**, with reusable header, footer,
installation, terminal, and search components. The docs are Markdown in an Astro
content collection. Pagefind supplies search. There is no React bundle on the
website.

The shared foundation is `packages/brand/`: fonts, palette, wordmark classes,
and font licenses. The apps keep their own layout and interaction styles.

## Motion and accessibility

The landing page uses the browser's native animation API for gentle section
entrances; the hero is visible immediately. Key actions share a fine border accent on arrival, hover, or keyboard
focus. These accents run once; the arrows and button positions stay still.
Reduced motion turns the sweeps and entrances off.

The terminal replays output captured from a real CLI project-creation
run, including the original banner colors, created files, and next command.
The local path is an example, and nothing runs in your browser. You can pause,
replay, or scroll through the output. With reduced motion enabled, you see the
complete static transcript instead.

## Making a visual change

Start with **`docs/STYLE_GUIDE.md` in the repository**. It records the exact
tokens, wordmark markup, component locations, accessibility conventions, and
checks to run. Change shared identity in the brand package instead of copying
new values into both apps.

For the repository structure and development commands, see
[Work on the project](../contributing/).
