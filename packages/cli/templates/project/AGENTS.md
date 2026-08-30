# Dumb Diagrams agent entrypoint

This repository is initialized for Dumb Diagrams work. Read
`.dumbdiagrams/instructions.md` for the canonical workflow and follow its
selective-reading links to the format, architecture, provider, catalog, and
examples documentation. Interpret the user's architecture intent first, then
write a valid portable `.dgm` source file at the location the user requests.
For new diagrams, use the documented `diagrams/<descriptive-slug>/` bundle and
write its `architecture-brief.md` in the same change. Preserve explicitly named
flat `.dgm` paths and place the matching `<stem>.architecture-brief.md` beside
them. Run `dumbdiagrams validate <path-to-diagram.dgm>` and do not report
completion unless it succeeds, then inspect the result in Studio.
