import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "packages/cli/src/**/*.ts",
        "packages/core/src/**/*.ts",
        "packages/render/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "packages/cli/src/index.ts",
      ],
    },
  },
});
