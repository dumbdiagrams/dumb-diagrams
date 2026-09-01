import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@dumb-diagrams/runtime/dsl": resolve("packages/runtime/src/dsl/index.ts"),
      "@dumb-diagrams/runtime/render": resolve("packages/runtime/src/render/index.ts"),
    },
  },
  test: {
    include: [
      "packages/**/src/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: ".artifacts/coverage",
      reporter: ["text", "lcov", "json-summary"],
      include: [
        "packages/cli/src/**/*.ts",
        "packages/runtime/src/**/*.ts",
        "packages/editor/src/**/*.ts",
        "packages/editor/src/ui/ErrorBoundary.tsx",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/index.ts",
        "**/types.ts",
        "**/vite-env.d.ts",
        // These are browser-bound orchestration layers. Their behavior is
        // exercised by Playwright rather than by the Node-focused coverage
        // suite below. Numeric floors are advisory; see scripts/warn-coverage.mjs.
        "packages/editor/src/canvas/**",
        "packages/editor/src/catalog-dnd.ts",
        "packages/editor/src/diagram-compiler.worker.ts",
        "packages/editor/src/interactions/InteractionOverlay.tsx",
        "packages/editor/src/state/**",
        "packages/editor/src/use-diagram-compilation.ts",
        "packages/editor/src/ui/theme.ts",
        "packages/editor/src/ui/IssueJournal.tsx",
      ],
    },
  },
});
