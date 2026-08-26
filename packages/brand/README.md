# Shared brand identity

CSS and self-hosted fonts shared by Studio and the website. Import
`@dumb-diagrams/brand/styles.css` once in a consumer entry point.

The approved wordmark is **dumbdiagrams.** Use the markup below without spaces
between its text segments. Product prose can still say **Dumb Diagrams**.

```html
<span class="dd-wordmark" role="img" aria-label="Dumb Diagrams">dumb<span class="dd-wordmark__light">diagrams</span><span class="dd-wordmark__dot">.</span></span>
```

Scale it with `--wordmark-size`. Do not independently override its weights,
tracking, or font in a consumer. The symbol is optional; keep it separate from
the text, as a sibling, and use an empty `alt` when the wordmark names the brand.

See [the style guide](../../docs/STYLE_GUIDE.md) for typography, palette,
components, motion, accessibility, and the boundary between UI and diagram fonts.
Font licenses are included in `FONT-LICENSES.txt` and copied into both builds.
