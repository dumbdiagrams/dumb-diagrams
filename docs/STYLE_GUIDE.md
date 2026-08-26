# Dumb Diagrams style guide

This is the shared visual contract for the website, documentation, and Studio.
The product should feel precise, approachable, and calm: navy gives it structure,
orange draws attention, and generous space makes the content easy to read.

## The official wordmark

The logo reads **dumbdiagrams.**: lowercase, no space, with an orange full stop.
“dumb” is heavy and “diagrams” is lighter. In prose, page titles, and accessible
names, write **Dumb Diagrams**. The editor is **Dumb Diagrams Studio**, or Studio
when the context is clear. Package names and CLI commands stay unchanged.

Use the existing illustrated logo beside the wordmark where space allows. Do
not stretch it, recolor provider icons to match it, or substitute an icon from a
UI library. Leave at least half the wordmark's height clear around the lockup.

The implementation lives in `packages/brand/styles.css`, consumed by both apps
through `@dumb-diagrams/brand/styles.css`. Do not recreate the weights or tracking
in app styles. Set `--wordmark-size` on the surrounding element to change scale.
The website header uses 23px (21px on small screens); Studio uses 20px.

```html
<span class="dd-wordmark" role="img" aria-label="Dumb Diagrams">dumb<span class="dd-wordmark__light">diagrams</span><span class="dd-wordmark__dot">.</span></span>
```

Keep the text nodes adjacent when rendering this markup: literal spaces or
newlines between them change the wordmark. If its parent already has an
accessible name, use `aria-hidden="true"` on the visual wordmark instead.

## Typography

| Use | Typeface | Treatment |
| --- | --- | --- |
| Official wordmark | Manrope Variable | 800 for `dumb`; 450 for `diagrams`; tracking −0.065em; line height 1.15 |
| Website and Studio interface | Manrope Variable | `--font-brand`; usually 400–750, with 500–550 for large website headings |
| Code, terminal, compact technical labels | IBM Plex Mono | `--font-code`; regular 400; keep technical text selectable |
| Website editorial emphasis | Georgia, system serif | Italic, limited to the manifesto and closing line; never the wordmark or app controls |
| Diagram labels and annotations | Existing runtime/diagram font stack | Inter, Noto Sans, system sans-serif; deliberately separate from interface typography |

Manrope and IBM Plex Mono are self-hosted by the brand package through Fontsource.
There are no Google Fonts requests. Font licenses are in
`packages/brand/FONT-LICENSES.txt` and copied into both built apps. The runtime's
diagram font stack is not a promise that Inter is bundled: exported SVGs retain
their existing fallback behavior. Changing diagram typography also affects text
measurement and geometry, so treat that as a renderer change with its own tests.

Website body text is 15px, documentation prose 14px with generous line height,
and Studio uses compact control-specific sizes. Use readable sentence case.
Uppercase monospace belongs in short labels, not paragraphs. Don't turn long
instructions into faint, tiny captions.

## Color

The logo is the source of the core palette. Shared values belong in the brand
package; app styles should alias them into semantic roles.

| Token | Value | Use |
| --- | --- | --- |
| `--brand-navy` | `#244068` | Main identity, headings, actions, diagram UI ink |
| `--brand-navy-deep` | `#183452` | Prompt panels, dark editorial sections, action hover |
| `--brand-navy-soft` | `#e7eef7` | Quiet selected states and supporting surfaces |
| `--brand-coral` | `#e66231` | Orange wordmark dot, small highlights and indicators |
| `--brand-coral-deep` | `#c94f2c` | Existing Studio danger role; use its semantic token |
| `--brand-coral-soft` | `#fbe4da` | Supporting warm tint |
| `--brand-orange` | `#f8a23f` | Amber from the illustration; secondary accent |
| `--brand-orange-deep` | `#a96816` | Supporting darker amber |
| `--brand-orange-soft` | `#fff0d5` | Supporting amber tint |
| `--brand-paper` | `#f7f6f2` | Website canvas |

The website uses `#586a7f` for secondary text and `#d3dbe3` for rules. For small
orange links on paper, it uses the darker `#a63f20`: the bright logo orange is
not the body-link color. Orange should punctuate a predominantly navy-and-paper
composition, not fill every heading or large section. Provider colors remain
part of the diagrams; they are not interface colors.

Studio retains its existing warm light surfaces and dark navy surfaces. Its
semantic tokens (`--ink`, `--surface`, `--action-fill`, `--focus`, and others)
live in `packages/editor/src/styles.css`. The wordmark automatically becomes
light under `data-theme="dark"`, retaining its orange dot. Test both themes:
never force a navy wordmark onto a dark panel.

## What components do we actually use?

There is **no shadcn/ui, Radix, Tailwind, or general component library** in either
surface. Sharing a brand does not mean shipping React to a static documentation
page.

| Surface | Implementation | Reuse before adding |
| --- | --- | --- |
| Studio | React 19, Vite, authored CSS | `src/ui/Modal.tsx`, `TopMenu.tsx`, `FloatingPanel.tsx`, `ToolDock.tsx`, `ThemeControl.tsx`, `ErrorBoundary.tsx` |
| Studio icons | Custom SVG React components | `packages/editor/src/ui/icons.tsx` (18px grid, typically 1.6px stroke) |
| Source editor | CodeMirror 6 through `@uiw/react-codemirror` | Existing editor extensions, theme, and transaction behavior |
| Website | Static Astro, authored layered CSS | `Header.astro`, `Footer.astro`, `Install.astro`, `Terminal.astro`, `Search.astro`, and `Base.astro` |
| Documentation | Astro content collections and Markdown | Shared docs layout, navigation, table of contents, code-copy control, Pagefind search |
| Brand | CSS-only workspace package | Shared font files, colors, wordmark classes and license notices |

Studio's compact floating panels, pills, and rounded controls serve editing.
The website uses sharper edges, fine rules, large type, and more space for
reading. Keep those differences intentional. Don't transplant marketing-sized
buttons into Studio or introduce a second modal implementation for one feature.

## Layout and interaction

Use an underlying 4px spacing rhythm, with optical adjustments for typography.
The website has a 1440px maximum shell and responsive gutters (64, 36, 24, 20px).
The desktop hero puts the headline and install command beside the terminal, with
the agent requirement underneath. Keep the complete composition visible at
1280 × 720 and 1440 × 900. Its terminal height adapts to the viewport; only the
transcript scrolls. Below 900px, stack the terminal underneath. On phones, allow
normal page scrolling instead of shrinking the text to force a single screen.
Docs use a navigation/article/contents layout that collapses on small screens.
Studio is a desktop editing surface; do not imply a mobile editor experience.

Prefer a border or a quiet surface change to a heavy shadow. Use Studio's existing
radius and shadow tokens rather than introducing new values for each control.
Keep visible keyboard focus, explicit button names, and native semantics.
Interactive tabs need keyboard navigation; dialogs need focus management and an
Escape path. Don't communicate errors or selection through color alone.

## Motion

The website uses the native Web Animations API for section entrances, with no
animation-library download. The terminal replays a real CLI project-creation run captured
at build time in a temporary directory. The capture uses 80 columns and truecolor,
and converts the CLI's ANSI styling into escaped HTML. Preserve its orange-to-navy
gradient and full stacked banner; scale the characters on narrow screens rather
than switching logos. Only the example local path and playback timing change.
No commands run in a visitor's browser, and creation does not generate an architecture.

The terminal types the command, then reveals the banner, project details, created
files, and next command in order. It runs once for about six seconds with
pause/resume and replay. Output scrolls inside the terminal, never the page;
scrolling or touching the terminal pauses playback so the reader stays in control.
It also pauses while the page is hidden. Section entrances run once, move at most
8px, and last 700ms. Keep the hero visible immediately without entrance animation. Use the shared
`cubic-bezier(.22, 1, .36, 1)` easing. Small hover color changes use 180ms transitions.

The website's `src/styles/motion.css` defines the motion tokens and `trace-border`
treatment: one 1px orange/amber/navy accent along an existing border over 2200ms.
Animate only its opacity, not background position, to avoid continuous repaints.
Use it on the install panel and primary header/closing actions. `data-trace`
adds one entrance accent; hover or keyboard focus can replay it. The border is
decorative and cannot intercept clicks. Keep arrows stationary; avoid translating
buttons, rotating glows, or continuously animated frames. Reduced motion removes
the sweep completely and preserves the ordinary border and keyboard focus ring.

Respect `prefers-reduced-motion`, including changes while the page is open.
Show the complete terminal when motion is reduced or JavaScript is unavailable.
Keep content visible before JavaScript; don't make animation a prerequisite for
reading. Avoid looping typewriters, parallax, scroll hijacking, and decorative
motion inside the diagram editor.

## Example windows

The section labeled “01 / A SHORTER PATH TO CLARITY” shows Image thumbnail
pipeline, AWS Data Transfer Hub, and Claims processing with Amazon Bedrock, in
that order. Import the same prompt/source pairs as Studio; do not simplify them
or invent a substitute. Keep the original renderer output and any routing notes.

Prompt panels use deep navy. Generated-source panels and the CLI use a black
`#0c0c0c` terminal surface, dark title bar, and decorative macOS traffic lights.
Prompt/source tabs are independent of example tabs and support arrow keys.
Diagrams start at 100% with zoom, fit, scrolling, and full-size SVG controls.

## Writing and maintaining docs

Start with what someone is trying to do, then show a small working example.
Use “you” and plain verbs. State limitations beside the feature they affect.
Organize public docs by the reader's task: start, make diagrams, understand the
implementation. Keep the technical contracts in `docs/TECHNICAL_OVERVIEW.md` and
the focused runtime references; keep the public explanation in
`packages/website/src/content/docs/`.

When changing shared styles, run `pnpm check:website`, `pnpm typecheck`, and the
relevant Studio browser tests. Check the header in both Studio themes, the site
on desktop and a narrow viewport, keyboard focus, and reduced-motion behavior.
Font or workspace dependency changes also need `pnpm build` and
`pnpm smoke:package`, because Studio and corresponding source ship in the CLI.
