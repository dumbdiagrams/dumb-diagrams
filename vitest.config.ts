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
        "packages/runtime/src/core/**/*.ts",
        "packages/runtime/src/render/**/*.ts",
      ],
      exclude: ["**/*.test.ts"],
      thresholds: {
        statements: 50,
        branches: 60,
        functions: 65,
        lines: 50,
      },
    },
  },
});
