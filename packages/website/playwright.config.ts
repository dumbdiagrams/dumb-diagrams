import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.WEBSITE_PLAYWRIGHT_PORT ?? 49322);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../.artifacts/playwright/website-results",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --dir ../.. check:studio:hosted && node scripts/serve-dist-with-studio.mjs",
    cwd: import.meta.dirname,
    env: { WEBSITE_PREVIEW_PORT: String(port) },
    url: `${baseURL}/docs/quality-and-scoring/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
