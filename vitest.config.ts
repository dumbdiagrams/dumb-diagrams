import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.{ts,tsx}"],
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
