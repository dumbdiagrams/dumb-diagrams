---
title: Brand and interface
description: The typography, colors, and components shared by the website and Studio.
section: Under the hood
order: 11
---
The visual system uses a short palette: navy, orange, and restrained typography.
The website uses open spacing; Studio keeps its controls compact so the diagram
remains central. The two surfaces share the same brand while serving different
purposes.

## One name, one wordmark

<div class="brand-specimen" aria-label="Official Dumb Diagrams wordmark"><span class="dd-wordmark" aria-hidden="true">dumb<span class="dd-wordmark__light">diagrams</span><span class="dd-wordmark__dot">.</span></span><span class="mono">THE OFFICIAL WORDMARK</span></div>

The wordmark is **dumbdiagrams.** All lowercase, no space, with an orange period.
In ordinary writing, we use **Dumb Diagrams**. The editor is **Dumb Diagrams
Studio**. Use Studio in running text when the context makes the product clear. Nothing changes about the package
name or the commands you type.

The lettering is **Manrope Variable**: weight 800 for “dumb”, 450 for “diagrams”,
with letter spacing of −0.065em. The existing illustrated logo can sit beside
it. Both the site and Studio import this treatment from the same brand package.

## Navy first, orange for emphasis

<div class="brand-swatches"><div class="swatch swatch-navy"><strong>Navy</strong><code>#244068</code></div><div class="swatch swatch-deep"><strong>Deep navy</strong><code>#183452</code></div><div class="swatch swatch-orange"><strong>Orange</strong><code>#e66231</code></div><div class="swatch swatch-paper"><strong>Paper</strong><code>#f7f6f2</code></div></div>

Navy comes from the logo and carries the headings, primary actions, and dark
sections. Orange marks accents such as a dot, selected tab, arrow, or
focus indicator. Paper keeps reading comfortable. Small orange links use a
darker shade so they stay readable; the bright logo color is for accents.

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

Studio uses **React 19 and custom components**, with CodeMirror 6 for the source
editor. Its menus, modals, floating panels, tool dock, theme control, and SVG
icons live in `packages/editor/src/ui/`. We do not use shadcn/ui, Radix, or
Tailwind.

The website uses **Astro and plain CSS**, with reusable header, footer,
installation, terminal, and search components. The docs are Markdown in an Astro
content collection. Pagefind supplies search. There is no React bundle on the
website.

The shared foundation is `packages/brand/`: fonts, palette, wordmark classes,
and font licenses. The apps keep their own layout and interaction styles.

## Motion and accessibility

The landing page uses Motion's lightweight animation entry point for gentle section
entrances. Key actions share a fine border sweep on arrival, hover, or keyboard
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
