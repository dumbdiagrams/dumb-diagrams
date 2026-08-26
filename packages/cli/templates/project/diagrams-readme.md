# Project diagrams

This is the writable output folder for the project. Keep one independent
`.dgm` source file per architecture or workflow.

## File policy

- `{{diagramFile}}` is only the starter diagram. Do not reuse it for a new
  request unless the user explicitly asks you to revise that file.
- For a new request, create a new descriptive kebab-case file such as
  `basic-web-app.dgm` or `event-driven-orders.dgm`.
- If the user names an existing diagram, edit that exact file and preserve
  its intentional layout and source structure.
- Never overwrite another existing `.dgm` just because it is the first file
  in the directory.

Open the folder in Studio to choose among the project diagrams:

```bash
npx create-dumb-diagrams@latest studio diagrams
```
