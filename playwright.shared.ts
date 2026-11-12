import { availableParallelism } from "node:os";
import type { PlaywrightTestConfig } from "@playwright/test";

/** The same editor scenarios and execution settings cover local and hosted builds. */
export const studioRegressions = {
  testDir: "./e2e",
  timeout: 45_000,
  // Leave CPU capacity for the browser and synchronous diagram compiler.
  workers: Math.min(4, Math.max(1, availableParallelism() - 1)),
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Animation regressions (including toast replay) exercise normal motion.
    contextOptions: { reducedMotion: "no-preference" },
  },
} satisfies PlaywrightTestConfig;
