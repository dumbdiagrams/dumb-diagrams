# Icon source notices

The checked-in vendor artwork is kept locally so the editor, CLI, packaged build,
and exported diagrams do not require a runtime download.

- AWS artwork: AWS Architecture Icons, July 2026 package. Source and terms are
  recorded in `icon-sources.lock.json`.
- Azure artwork: Azure Public Service Icons V24. Source and terms are recorded in
  `icon-sources.lock.json`.
- Google Cloud artwork: Google Cloud core and category icon packages. The
  product-to-glyph mapping is explicit in `scripts/generate-catalog.mjs`.
- Cloud-agnostic artwork: the local curated semantic collection is authored for
  this repository and intentionally contains no vendor-brand artwork. The lock
  file records the reviewed design/source reference used for this vocabulary.

Reviewed: 2026-08-20.
