import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  // Relative URLs keep the same asset paths on `/` and `/dumb-diagrams/`.
  base: "./",
  publicDir: resolve(__dirname, "public"),
  resolve: {
    alias: {
      "@dumb-diagrams/core": resolve(__dirname, "../core/src/index.ts"),
      "@dumb-diagrams/catalog": resolve(__dirname, "../catalog/src/index.ts"),
      "@dumb-diagrams/dsl": resolve(__dirname, "../dsl/src/index.ts"),
      "@dumb-diagrams/layout": resolve(__dirname, "../layout/src/index.ts"),
      "@dumb-diagrams/render": resolve(__dirname, "../render/src/browser.ts"),
      "@dumb-diagrams/route": resolve(__dirname, "../route/src/index.ts"),
      "@dumb-diagrams/grammar-aws": resolve(__dirname, "../grammar-aws/src/index.ts"),
    },
  },
  server: {
    port: 5174,
    fs: { allow: ["..", "../.."] },
  },
});
