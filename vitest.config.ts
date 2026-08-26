import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: ".artifacts/coverage",
      reporter: ["text", "lcov"],
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
        // suite below.
        "packages/editor/src/canvas/**",
        "packages/editor/src/catalog-dnd.ts",
        "packages/editor/src/diagram-compiler.worker.ts",
        "packages/editor/src/state/**",
        "packages/editor/src/use-diagram-compilation.ts",
        "packages/editor/src/ui/theme.ts",
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 75,
        lines: 70,
      },
    },
  },
});
