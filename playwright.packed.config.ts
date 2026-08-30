import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-packed",
  outputDir: ".artifacts/playwright/packed-test-results",
  timeout: 60_000,
  expect: {
    timeout: 12_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/start-packed-studio-e2e.mjs",
    url: "http://127.0.0.1:5175/",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
