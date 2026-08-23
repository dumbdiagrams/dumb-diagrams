# dumbdiagrams

Local, source-first diagram Studio for agent-generated `.dgm` files.

```bash
npx dumbdiagrams@latest init my-diagrams
cd my-diagrams
npx dumbdiagrams@latest studio architecture.dgm
```

The initializer creates the diagram source and the local instructions that
coding agents should read before editing it. Studio watches that source file
and saves validated changes back to disk.
