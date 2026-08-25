import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: ".artifacts/coverage",
      reporter: ["text", "lcov"],
      include: [
        "packages/cli/src/**/*.ts",
        "packages/runtime/src/**/*.ts",
        "packages/editor/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
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
