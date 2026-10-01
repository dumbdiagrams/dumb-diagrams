import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@dumb-diagrams/runtime/core": resolve("packages/runtime/src/core/index.ts"),
      "@dumb-diagrams/runtime/dsl": resolve("packages/runtime/src/dsl/index.ts"),
      "@dumb-diagrams/runtime/catalog": resolve("packages/runtime/src/catalog/index.ts"),
      "@dumb-diagrams/runtime/render": resolve("packages/runtime/src/render/index.ts"),
      "@dumb-diagrams/runtime/test-fixtures": resolve("packages/runtime/test-fixtures.ts"),
    },
  },
  test: {
    // Routing and coverage instrumentation compete for CPU during parallel runs.
    maxWorkers: 4,
    include: [
      "packages/**/src/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.{ts,tsx}",
      "tests/compat/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: ".artifacts/coverage",
      reporter: ["text", "lcov", "json-summary"],
      include: [
        "packages/cli/src/**/*.ts",
        "packages/runtime/src/**/*.ts",
        "packages/editor/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/index.ts",
        "**/types.ts",
        "**/vite-env.d.ts",
        // These are browser-bound orchestration layers. Their behavior is
        // exercised by Playwright rather than by the Node-focused coverage
        // suite below. Required numeric floors live in scripts/check-coverage.mjs.
        "packages/editor/src/interactions/InteractionOverlay.tsx",
        "packages/editor/src/diagram-compiler.worker.ts",
        "packages/editor/src/use-diagram-compilation.ts",
        // These are application/browser orchestration boundaries. Their
        // behavior is owned by Playwright; all other production TS/TSX,
        // including state, panels, and tested canvas helpers, is measured.
        "packages/editor/src/main.tsx",
      ],
    },
  },
});
