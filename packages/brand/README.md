# Shared brand identity

`@dumb-diagrams/brand` owns the shared CSS tokens, wordmark styles, and
self-hosted UI fonts used by Studio and the website. Import the stylesheet once
from each consumer entry point:

```css
@import '@dumb-diagrams/brand/styles.css';
```

Use the `.dd-wordmark` classes and set `--wordmark-size` when rendering the
wordmark. Keep markup, typography, palette, accessibility, theme, and reuse
decisions aligned with the [style guide](../../docs/STYLE_GUIDE.md).

Font licenses are included in [FONT-LICENSES.txt](FONT-LICENSES.txt) and copied
into both builds.
