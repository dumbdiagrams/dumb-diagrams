import { availableParallelism } from "node:os";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5174);
const baseURL = `http://127.0.0.1:${port}`;
// Browser contexts and the Studio compiler compete for CPU on small CI
// runners. Reserve one core for Vite/browser orchestration, with a local cap.
const workers = Math.min(4, Math.max(1, availableParallelism() - 1));

export default defineConfig({
  testDir: "./e2e",
  outputDir: ".artifacts/playwright/test-results",
  timeout: 45_000,
  workers,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  webServer: {
    command: `pnpm catalog:stage && pnpm --dir packages/editor exec vite --host 127.0.0.1 --port ${port}`,
    url: `${baseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
