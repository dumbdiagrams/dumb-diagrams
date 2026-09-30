import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const editorDir = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  // Relative URLs keep the same asset paths on `/` and `/dumb-diagrams/`.
  base: "./",
  publicDir: resolve(editorDir, "public"),
  build: {
    // The catalog index is an intentional cacheable boundary (~1.6 MB). Keep
    // the warning useful for accidental growth beyond that boundary.
    chunkSizeWarningLimit: 1700,
    rollupOptions: {
      output: {
        // The generated provider index is intentionally large and changes on
        // its own cadence. Keep it cacheable and out of the editor bootstrap
        // chunk so UI fixes do not invalidate a multi-megabyte entry file.
        manualChunks(id) {
          if (id.startsWith(resolve(editorDir, "../runtime/src/catalog"))) return "catalog-index";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@dumb-diagrams/runtime/core": resolve(editorDir, "../runtime/src/core/index.ts"),
      "@dumb-diagrams/runtime/catalog": resolve(editorDir, "../runtime/src/catalog/index.ts"),
      "@dumb-diagrams/runtime/dsl": resolve(editorDir, "../runtime/src/dsl/index.ts"),
      "@dumb-diagrams/runtime/layout": resolve(editorDir, "../runtime/src/layout/index.ts"),
      "@dumb-diagrams/runtime/render": resolve(editorDir, "../runtime/src/render/browser.ts"),
      "@dumb-diagrams/runtime/route": resolve(editorDir, "../runtime/src/route/index.ts"),
      "@dumb-diagrams/runtime/grammar-aws": resolve(editorDir, "../runtime/src/grammar-aws/index.ts"),
      "@dumb-diagrams/runtime/test-fixtures": resolve(editorDir, "../runtime/test-fixtures.ts"),
    },
  },
  server: {
    port: 5174,
    fs: { allow: ["..", "../.."] },
  },
});
