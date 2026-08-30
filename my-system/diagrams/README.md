# Diagram files

Keep one independent `.dgm` source file per architecture or workflow. Files are
portable and may live anywhere; Studio's **Open** action selects them directly.

## File policy

- `architecture.dgm` is only the starter diagram. Do not reuse it for a new
  request unless the user explicitly asks you to revise that file.
- For a new request, create a new descriptive kebab-case file such as
  `basic-web-app.dgm` or `event-driven-orders.dgm`.
- If the user names an existing diagram, edit that exact file and preserve
  its intentional layout and source structure.
- Never overwrite another existing `.dgm` just because it is the first file
  in the directory.

Start Studio with `dumbdiagrams studio`, then choose **Open** and select the
specific `.dgm` file you want to edit.
