# Dumb Diagrams agent entrypoint

This repository is initialized for Dumb Diagrams work. Read
`.dumbdiagrams/instructions.md` for the canonical workflow and follow its
selective-reading links to the format, architecture, provider, and catalog
documentation. Interpret the user's architecture intent first, then
write a valid portable `.dgm` source file at the location the user requests.
For new diagrams, use the documented `diagrams/<descriptive-slug>/` bundle and
write `architecture-brief.md` and `requirements.json` before its source.
Preserve named flat paths, using `<stem>.architecture-brief.md` and
`<stem>.requirements.json`. Run normal and strict `dumbdiagrams validate`, then
inspect in Studio. Preserve every required relationship during layout repair.
After two unsuccessful layout attempts, report remaining routing warnings
without claiming full completion or weakening requirements.
